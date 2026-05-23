import {
  PrismaClient,
  UserRole,
  PharmacyStatus,
  OrderType,
  OrderStatus,
  PaymentMethod,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function fetchWithTimeout(resource: string, options: any = {}) {
  const { timeout = 10000 } = options; // 10s timeout to allow real DB queries
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal,
  });
  clearTimeout(id);
  return response;
}

function resolveSchema(ref: string, doc: any) {
  if (!ref) return null;
  const schemaName = ref.split('/').pop();
  return doc.components.schemas[schemaName];
}

function generateDummyPayload(schema: any, doc: any, dbRefs: any) {
  if (!schema) return {};
  if (schema.$ref) schema = resolveSchema(schema.$ref, doc);
  if (!schema || schema.type !== 'object' || !schema.properties) return {};

  const payload: any = {};
  for (const [key, prop] of Object.entries<any>(schema.properties)) {
    const type = prop.type;
    const format = prop.format;

    if (prop.$ref) {
      const subSchema = resolveSchema(prop.$ref, doc);
      payload[key] = generateDummyPayload(subSchema, doc, dbRefs);
      continue;
    }

    if (key.toLowerCase() === 'pharmacyid' && dbRefs.pharmacyId)
      payload[key] = dbRefs.pharmacyId;
    else if (key.toLowerCase() === 'branchid' && dbRefs.branchId)
      payload[key] = dbRefs.branchId;
    else if (key.toLowerCase() === 'medicationid' && dbRefs.medicationId)
      payload[key] = dbRefs.medicationId;
    else if (key.toLowerCase() === 'patientid' && dbRefs.patientId)
      payload[key] = dbRefs.patientId;
    else if (key.toLowerCase() === 'orderid' && dbRefs.orderId)
      payload[key] = dbRefs.orderId;
    else if (key.toLowerCase().includes('email')) payload[key] = 'pt@test.com';
    else if (key.toLowerCase().includes('password'))
      payload[key] = 'TestPass123!';
    else if (
      key === 'tempPassword' ||
      key === 'currentPassword' ||
      key === 'newPassword'
    )
      payload[key] = 'TestPass123!';
    else if (key.toLowerCase().includes('phone')) payload[key] = '0780000001';
    else if (key === 'latitude' || key === 'lat') payload[key] = -1.95;
    else if (key === 'longitude' || key === 'lng') payload[key] = 30.06;
    else if (key.toLowerCase().includes('id') && dbRefs.patientId)
      payload[key] = dbRefs.patientId;
    else if (key.toLowerCase().includes('date'))
      payload[key] = new Date().toISOString();
    else if (
      key === 'deliveryZones' ||
      key === 'operatingHours' ||
      key === 'workingHours' ||
      key === 'clockInLocation' ||
      key === 'clockOutLocation'
    )
      payload[key] = { region: 'Kigali' };
    else if (key === 'amount') payload[key] = '1000';
    else if (key === 'financialTransactionId' || key === 'externalId')
      payload[key] = 'TRANS-12345';
    else if (key.toLowerCase().includes('reason'))
      payload[key] = 'Valid reason for action';
    else if (
      key.toLowerCase().includes('license') ||
      key.toLowerCase().includes('certificate')
    )
      payload[key] = 'https://dummy.com/cert.pdf';
    else if (prop.enum && prop.enum.length > 0) payload[key] = prop.enum[0];
    else if (type === 'string') {
      if (format === 'date-time' || format === 'date')
        payload[key] = new Date().toISOString();
      else if (key.toLowerCase().includes('code')) payload[key] = '12345';
      else payload[key] = 'dummy_string';
    } else if (type === 'number' || type === 'integer') payload[key] = 100;
    else if (type === 'boolean') payload[key] = true;
    else if (type === 'array') payload[key] = [];
    else payload[key] = 'test';
  }
  return payload;
}

async function prepareDatabase() {
  console.log('Preparing database and harvesting real IDs...');

  // 1. Super Admin
  const adminPass = await bcrypt.hash('SuperAdmin@2025', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@evuze.rw' },
    update: {
      password: adminPass,
      isActive: true,
      isVerified: true,
      role: UserRole.SUPER_ADMIN,
    },
    create: {
      email: 'admin@evuze.rw',
      password: adminPass,
      isActive: true,
      isVerified: true,
      role: UserRole.SUPER_ADMIN,
    },
  });

  // 2. Pharmacy
  let pharmacy = await prisma.pharmacy.findFirst();
  if (!pharmacy) {
    const pUser = await prisma.user.create({
      data: {
        email: 'ph@test.com',
        password: adminPass,
        role: UserRole.PHARMACY,
        isVerified: true,
      },
    });
    pharmacy = await prisma.pharmacy.create({
      data: {
        userId: pUser.id,
        name: 'Test Pharmacy',
        representativeName: 'Rep',
        phone: '0780000000',
        address: 'Kigali',
        latitude: -1.9,
        longitude: 30.0,
        dateOfIncorporation: new Date(),
        rdbCertificate: 'cert',
        pharmacyLicense: 'lic',
        status: PharmacyStatus.APPROVED,
        isLocationVerified: true,
      },
    });
  }

  // 3. Branch
  let branch = await prisma.branch.findFirst({
    where: { pharmacyId: pharmacy.id },
  });
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        pharmacy: { connect: { id: pharmacy.id } },
        name: 'Test Branch',
        address: 'Kigali',
        latitude: -1.9,
        longitude: 30.0,
        phone: '0780000000',
        branchManagerEmail: 'mgr@test.com',
        isActive: true,
        isLocationVerified: true,
      },
    });
  }

  // 4. Patient
  let patient = await prisma.patient.findFirst();
  if (!patient) {
    const ptUser = await prisma.user.create({
      data: {
        email: 'pt@test.com',
        password: adminPass,
        role: UserRole.PATIENT,
        isVerified: true,
      },
    });
    patient = await prisma.patient.create({
      data: {
        userId: ptUser.id,
        firstName: 'Test',
        lastName: 'Patient',
        phone: '0780000001',
      },
    });
  }

  // 5. Medication
  let medication = await prisma.medication.findFirst({
    where: { branchId: branch.id },
  });
  if (!medication) {
    medication = await prisma.medication.create({
      data: {
        pharmacyId: pharmacy.id,
        branchId: branch.id,
        name: 'Paracetamol',
        category: 'Painkiller',
        price: 1000,
        quantity: 50,
      },
    });
  }

  // 6. Order
  let order = await prisma.order.findFirst();
  if (!order) {
    order = await prisma.order.create({
      data: {
        patientId: patient.id,
        pharmacyId: pharmacy.id,
        branchId: branch.id,
        orderNumber: 'ORD-1234',
        type: OrderType.DELIVERY,
        subtotal: 1000,
        total: 1000,
        paymentMethod: PaymentMethod.CASH,
        patientPayment: 1000,
      },
    });
  }

  return {
    adminId: admin.id,
    pharmacyId: pharmacy.id,
    branchId: branch.id,
    patientId: patient.id,
    medicationId: medication.id,
    orderId: order.id,
    paymentId: order.id, // fallback since payments share relation
  };
}

async function run() {
  const dbRefs = await prepareDatabase();
  console.log('Harvested IDs:', dbRefs);

  const baseUrl = 'http://localhost:4000/api';
  let adminToken = null,
    patientToken = null,
    pharmacyToken = null;

  // Login Admin
  try {
    const res = await fetchWithTimeout(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@evuze.rw',
        password: 'SuperAdmin@2025',
      }),
    });
    adminToken = (await res.json()).accessToken;
    if (adminToken) console.log('Admin Token acquired.');
  } catch (e) {}

  // Login Patient
  try {
    const res = await fetchWithTimeout(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'pt@test.com',
        password: 'SuperAdmin@2025',
      }),
    });
    patientToken = (await res.json()).accessToken;
    if (patientToken) console.log('Patient Token acquired.');
  } catch (e) {}

  // Login Pharmacy
  try {
    const res = await fetchWithTimeout(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ph@test.com',
        password: 'SuperAdmin@2025',
      }),
    });
    pharmacyToken = (await res.json()).accessToken;
    if (pharmacyToken) console.log('Pharmacy Token acquired.');
  } catch (e) {}

  console.log('Fetching Swagger JSON...');
  const res = await fetchWithTimeout(`${baseUrl}/docs-json`);
  const swaggerDoc = await res.json();

  const paths = swaggerDoc.paths;
  const results: any[] = [];

  const tokens = [
    { name: 'Admin', token: adminToken },
    { name: 'Patient', token: patientToken },
    { name: 'Pharmacy', token: pharmacyToken },
  ];

  for (const [path, methods] of Object.entries<any>(paths)) {
    for (const [method, details] of Object.entries<any>(methods)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;

      // Replace URL variables with harvested DB refs
      let resolvedPath = path;
      if (path.includes('medications/{id}'))
        resolvedPath = resolvedPath.replace('{id}', dbRefs.medicationId);
      else if (path.includes('orders/{id}'))
        resolvedPath = resolvedPath.replace('{id}', dbRefs.orderId);
      else if (path.includes('payments/{orderId}'))
        resolvedPath = resolvedPath.replace('{orderId}', dbRefs.orderId);
      else if (
        path.includes('pharmacies/admin/{id}') ||
        path.includes('pharmacies/{id}')
      )
        resolvedPath = resolvedPath.replace('{id}', dbRefs.pharmacyId);
      else if (path.includes('branches/{id}'))
        resolvedPath = resolvedPath.replace('{id}', dbRefs.branchId);
      else
        resolvedPath = resolvedPath.replace(/\{([^}]+)\}/g, dbRefs.patientId); // Fallback ID

      const url = `http://localhost:4000${resolvedPath}`;
      console.log(`-> Testing [${method.toUpperCase()}] ${url}`);

      let payloadObj: any = undefined;
      if (
        method !== 'get' &&
        details.requestBody?.content?.['application/json']
      ) {
        payloadObj = generateDummyPayload(
          details.requestBody.content['application/json'].schema,
          swaggerDoc,
          dbRefs,
        );
      } else if (method !== 'get') {
        payloadObj = {};
      }

      let bestResponse: any = null;
      let bestTokenName = 'None';

      let isMultipart = false;
      let bodyData: any = undefined;

      if (path.includes('/upload')) {
        isMultipart = true;
        const formData = new FormData();
        const fileBlob = new Blob(['dummy content'], { type: 'image/jpeg' });
        formData.append('file', fileBlob, 'dummy.jpg');
        bodyData = formData;
      } else {
        bodyData = payloadObj ? JSON.stringify(payloadObj) : undefined;
      }

      for (const { name, token } of tokens) {
        if (!token) continue;

        let headers: any = {};
        try {
          if (isMultipart) {
            headers = { Authorization: `Bearer ${token}` };
          } else {
            headers = {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            };
          }

          const res = await fetchWithTimeout(url, {
            method: method.toUpperCase(),
            headers: headers,
            body: bodyData,
            timeout: 10000,
          });
          const status = res.status;
          const bodyText = await res.text();
          let parsedBody = {};
          try {
            parsedBody = JSON.parse(bodyText);
          } catch (e) {}

          const currentResponse = {
            status,
            body: parsedBody,
            rawText: bodyText,
          };

          if (!bestResponse) {
            bestResponse = currentResponse;
            bestTokenName = name;
          } else {
            const isCurrentAuthError =
              currentResponse.status === 401 || currentResponse.status === 403;
            const isBestAuthError =
              bestResponse.status === 401 || bestResponse.status === 403;

            if (isBestAuthError && !isCurrentAuthError) {
              bestResponse = currentResponse;
              bestTokenName = name;
            } else if (
              !isBestAuthError &&
              !isCurrentAuthError &&
              currentResponse.status < 400 &&
              bestResponse.status >= 400
            ) {
              bestResponse = currentResponse;
              bestTokenName = name;
            }
          }
        } catch (e) {
          // ignore fetch timeouts
        }
      }

      if (!bestResponse) {
        bestResponse = {
          status: 'ERROR',
          rawText: 'Request timed out or failed completely (10s limit)',
          body: {},
        };
        bestTokenName = 'All';
      }

      let errorReason = '';
      if (bestResponse.status >= 400 || bestResponse.status === 'ERROR') {
        errorReason =
          bestResponse.body.message ||
          bestResponse.body.error ||
          bestResponse.rawText.slice(0, 50);
        if (Array.isArray(errorReason)) errorReason = errorReason.join(', ');
      }

      results.push({
        method: method.toUpperCase(),
        path: path,
        status: bestResponse.status,
        tokenUsed: bestTokenName,
        error: errorReason,
      });
    }
  }

  let markdown = '# API Endpoint Status Report (True E2E Validation)\n\n';
  markdown += '| Method | Endpoint | Status | Role Used | Error / Reason |\n';
  markdown += '|--------|----------|--------|-----------|----------------|\n';
  for (const res of results) {
    let statusIcon = res.status < 400 ? '✅ ' + res.status : '❌ ' + res.status;
    if (res.status === 'ERROR') statusIcon = '⚠️ ERROR';
    if (res.status === 401 || res.status === 403)
      statusIcon = '🔒 ' + res.status;
    if (res.status === 404) statusIcon = '❓ ' + res.status;

    const errorStr = res.error
      ? String(res.error).replace(/\|/g, '-').slice(0, 100).replace(/\n/g, ' ')
      : '-';
    markdown += `| ${res.method} | \`${res.path}\` | ${statusIcon} | ${res.tokenUsed} | ${errorStr} |\n`;
  }

  fs.writeFileSync(
    '/home/nv/.gemini/antigravity/brain/6b25aa02-b51e-4ea9-8a0c-9f07117311e0/scratch/report-e2e.md',
    markdown,
  );
  console.log('Done! True E2E report saved.');
}

run().catch(console.error);
