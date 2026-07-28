import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const logger = new Logger('PrismaReadReplicaRouter');

// Operations that only read data — safe to serve from a replica that may
// lag the primary by a few hundred milliseconds to a couple seconds.
const REPLICA_READ_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

// Prisma model delegate property names (e.g. `prisma.patient`) are always
// the camelCase form of the PascalCase model name in `Prisma.ModelName`.
const MODEL_DELEGATE_NAMES = new Set(
  Object.keys(Prisma.ModelName).map(
    (name) => name.charAt(0).toLowerCase() + name.slice(1),
  ),
);

/**
 * Wraps a model delegate (e.g. `primaryClient.patient`) so that read
 * operations try the replica delegate first and fall back to the primary
 * delegate if the replica call throws (connection refused, replica down for
 * failover testing, etc). Write operations always go straight to primary.
 */
function routeModelDelegate(
  modelName: string,
  primaryDelegate: any,
  replicaDelegate: any,
) {
  return new Proxy(primaryDelegate, {
    get(target, prop, receiver) {
      if (
        typeof prop === 'string' &&
        REPLICA_READ_OPERATIONS.has(prop) &&
        typeof replicaDelegate[prop] === 'function'
      ) {
        return async (...args: unknown[]) => {
          try {
            return await replicaDelegate[prop](...args);
          } catch (err) {
            logger.warn(
              `Replica read failed for ${modelName}.${prop} — falling back to primary. Reason: ${(err as Error).message}`,
            );
            return target[prop](...args);
          }
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Wraps a fully-extended primary Prisma client so that model read
 * operations are routed to `replicaClient` (with automatic fallback to
 * primary on replica failure), while everything else — writes,
 * `$transaction`, raw queries, and non-model members — passes straight
 * through to the primary client untouched.
 */
export function createReadReplicaRouter<T extends object>(
  primaryClient: T,
  replicaClient: T,
): T {
  return new Proxy(primaryClient, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && MODEL_DELEGATE_NAMES.has(prop)) {
        const primaryDelegate = Reflect.get(target, prop, receiver);
        const replicaDelegate = (replicaClient as any)[prop];
        if (primaryDelegate && replicaDelegate) {
          return routeModelDelegate(prop, primaryDelegate, replicaDelegate);
        }
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
