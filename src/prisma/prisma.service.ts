// backend/src/prisma/prisma.service.ts

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { auditEncryptionExtension, createAuditEncryptionExtension } from './prisma.extension';
import { createReadReplicaRouter } from './read-replica.router';

const logger = new Logger('PrismaService');

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private replicaClient?: PrismaClient;

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'production'
          ? ['error', 'warn']
          : ['query', 'error', 'warn'],
    });

    const extended = this.$extends(auditEncryptionExtension) as any;

    const replicaUrl = process.env.DATABASE_REPLICA_URL;
    let routed = extended;

    if (replicaUrl) {
      this.replicaClient = new PrismaClient({
        datasources: { db: { url: replicaUrl } },
        log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn'],
      });
      // Audit-log writes must always land on the primary — the replica is a
      // read-only standby and would reject the write.
      const extendedReplica = this.replicaClient.$extends(
        createAuditEncryptionExtension(extended),
      ) as any;
      routed = createReadReplicaRouter(extended, extendedReplica);
      logger.log('Read-replica routing enabled (DATABASE_REPLICA_URL set)');
    }

    return new Proxy(this, {
      get: (target, prop) => {
        if (prop in routed) {
          return routed[prop];
        }
        return (target as any)[prop];
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
    console.log('✅ Database connected');

    if (this.replicaClient) {
      try {
        await this.replicaClient.$connect();
        logger.log('✅ Read-replica connected');
      } catch (err) {
        // Don't block app startup on the replica — read calls fall back to
        // primary automatically until it comes back.
        logger.warn(`Read-replica unreachable at startup, will retry per-query: ${(err as Error).message}`);
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log('❌ Database disconnected');

    if (this.replicaClient) {
      await this.replicaClient.$disconnect();
    }
  }

  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') return;

    const models = Reflect.ownKeys(this).filter(
      (key) => typeof key === 'string' && key[0] !== '_',
    ) as string[];

    return Promise.all(models.map((modelKey) => this[modelKey].deleteMany()));
  }
}
