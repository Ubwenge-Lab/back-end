import { Prisma } from '@prisma/client';
import { correlationStorage } from '../logger/correlation.storage';
import { 
  encryptDeterministic, decryptDeterministic, 
  encryptNonDeterministic, decryptNonDeterministic 
} from '../common/utils/encryption.util';

const SENSITIVE_DETERMINISTIC_FIELDS = ['phone', 'nationalId', 'mrn'];
const SENSITIVE_NON_DETERMINISTIC_FIELDS = ['diagnosisSummary', 'notes', 'nurseNotes', 'reason', 'dischargeNotes'];
const CLINICAL_MODELS = [
  'Patient', 'Appointment', 'TriageVitals', 'MARLog', 
  'InpatientVitals', 'MedicalHistoryAccess', 'MedicalRecordLog', 'InpatientAdmission', 'BedTransfer'
];

function encryptArgs(args: any) {
  if (!args) return;
  
  // Encrypt payload for Creates / Updates
  if (args.data) {
    for (const field of SENSITIVE_DETERMINISTIC_FIELDS) {
      if (args.data[field]) args.data[field] = encryptDeterministic(args.data[field]);
    }
    for (const field of SENSITIVE_NON_DETERMINISTIC_FIELDS) {
      if (args.data[field]) args.data[field] = encryptNonDeterministic(args.data[field]);
    }
  }

  // Encrypt search parameters for EXACT match (Deterministic only)
  if (args.where) {
    for (const field of SENSITIVE_DETERMINISTIC_FIELDS) {
      if (args.where[field] && typeof args.where[field] === 'string') {
        args.where[field] = encryptDeterministic(args.where[field]);
      }
    }
  }
}

function decryptResult(result: any) {
  if (!result) return;
  
  if (Array.isArray(result)) {
    result.forEach(decryptResult);
    return;
  }

  // Handle nested objects (e.g. Prisma `include` clauses bringing back related models)
  for (const key in result) {
    if (typeof result[key] === 'object' && result[key] !== null && !(result[key] instanceof Date)) {
      decryptResult(result[key]);
    }
  }

  for (const field of SENSITIVE_DETERMINISTIC_FIELDS) {
    if (result[field]) result[field] = decryptDeterministic(result[field]);
  }
  for (const field of SENSITIVE_NON_DETERMINISTIC_FIELDS) {
    if (result[field]) result[field] = decryptNonDeterministic(result[field]);
  }
}

// Builds the encryption/decryption + audit-log extension. `auditWriteClient`
// lets a read-replica client still write its audit log rows to the primary
// database — replicas are read-only standbys, so writing `auditLog.create`
// against the replica itself would fail.
export function createAuditEncryptionExtension(auditWriteClient?: unknown) {
  return Prisma.defineExtension((client) => {
    const auditTarget = auditWriteClient ?? client;

    return client.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const store = correlationStorage.getStore();
            const isClinicalModel = CLINICAL_MODELS.includes(model);

            // 1. Intercept & Encrypt Before Saving / Searching
            if (isClinicalModel) {
              encryptArgs(args);
            }

            // 2. Execute DB Query
            const result = await query(args);

            // 3. Decrypt on Retrieval
            if (isClinicalModel && result) {
              decryptResult(result);
            }

            // 4. Fire Async Audit Log if clinical model accessed by a user
            if (isClinicalModel && store && store.userId) {
              const opType = ['findUnique', 'findFirst', 'findMany', 'count'].includes(operation) ? 'READ' : 'WRITE';

              Promise.resolve().then(() => {
                (auditTarget as any).auditLog.create({
                  data: {
                    targetType: model,
                    action: opType,
                    targetId: (result && typeof result === 'object' && 'id' in result) ? String((result as any).id) : null,
                    actorId: store.userId,
                    actorRole: store.userRole || 'UNKNOWN',
                    ip: store.ipAddress || '0.0.0.0',
                    metadata: { reason: store.actionReason || 'Standard Clinical Access' },
                  }
                }).catch((err: any) => console.error(`[Audit Log Failed]: ${err.message}`));
              });
            }

            return result;
          },
        },
      },
    });
  });
}

export const auditEncryptionExtension = createAuditEncryptionExtension();
