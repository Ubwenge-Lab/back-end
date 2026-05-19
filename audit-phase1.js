const axios = require('axios');

const API_URL = 'http://localhost:4000/api';

async function auditAuth() {
  console.log('🚀 Starting Phase 1: Auth Module Audit\n');
  const results = [];
  let patientToken = null;
  let patientRefreshToken = null;

  const runTest = async (name, requestFn) => {
    try {
      const res = await requestFn();
      console.log(`✅ [PASS] ${name} (Status: ${res.status})`);
      results.push({ name, status: 'PASS', code: res.status });
      return res.data;
    } catch (err) {
      const status = err.response?.status || 'ERR';
      const msg = err.response?.data?.message || err.message;
      console.log(`❌ [FAIL] ${name} (Status: ${status}) - ${msg}`);
      results.push({ name, status: 'FAIL', code: status, error: msg });
      return null;
    }
  };

  // 1. Patient Login
  const loginData = await runTest('POST /auth/login (Alice)', () => 
    axios.post(`${API_URL}/auth/login`, {
      email: 'alice@patient.com',
      password: 'Test@1234'
    })
  );

  if (loginData && loginData.accessToken) {
    patientToken = loginData.accessToken;
    patientRefreshToken = loginData.refreshToken;
  }

  // 2. Refresh Token
  if (patientRefreshToken) {
    await runTest('POST /auth/refresh', () => 
      axios.post(`${API_URL}/auth/refresh`, {}, {
        headers: { Authorization: `Bearer ${patientRefreshToken}` }
      })
    );
  }

  // 3. Register New Patient
  const uniqueId = Date.now();
  await runTest('POST /auth/register/patient', () => 
    axios.post(`${API_URL}/auth/register/patient`, {
      firstName: 'Audit',
      lastName: 'User',
      email: `audit.patient.${uniqueId}@example.com`,
      password: 'Test@1234Audit!',
      confirmPassword: 'Test@1234Audit!',
      phone: `+25078${Math.floor(1000000 + Math.random() * 9000000)}`
    })
  );

  // 4. Register Pharmacy
  await runTest('POST /auth/register/pharmacy', () => 
    axios.post(`${API_URL}/auth/register/pharmacy`, {
      email: `audit.pharma.${uniqueId}@example.com`,
      password: 'Test@1234Audit!',
      confirmPassword: 'Test@1234Audit!',
      pharmacyName: 'Audit Pharmacy Ltd',
      representativeName: 'Dr. Audit',
      phone: `+25078${Math.floor(1000000 + Math.random() * 9000000)}`,
      address: 'Kigali, Rwanda',
      latitude: -1.94,
      longitude: 30.06,
      dateOfIncorporation: new Date().toISOString(),
      rdbCertificate: 'RDB-123456',
      pharmacyLicense: 'LIC-123456',
      businessRegistration: 'BR-123456'
    })
  );

  // 5. Register Hospital
  await runTest('POST /auth/register/hospital', () => 
    axios.post(`${API_URL}/auth/register/hospital`, {
      email: `audit.hospital.${uniqueId}@example.com`,
      password: 'Test@1234Audit!',
      confirmPassword: 'Test@1234Audit!',
      hospitalName: 'Audit General Hospital',
      representativeName: 'Dr. Admin',
      phone: `+25078${Math.floor(1000000 + Math.random() * 9000000)}`,
      address: 'Kigali, Rwanda',
      latitude: -1.94,
      longitude: 30.06,
      dateOfIncorporation: new Date().toISOString(),
      rdbCertificate: 'HOSP-RDB-123',
      pharmacyLicense: 'HOSP-LIC-123',
      businessRegistration: 'HOSP-BR-123'
    })
  );

  // 6. Logout
  if (patientToken) {
    await runTest('POST /auth/logout', () => 
      axios.post(`${API_URL}/auth/logout`, {}, {
        headers: { Authorization: `Bearer ${patientToken}` }
      })
    );
  }

  console.log('\n📊 Summary:');
  const passed = results.filter(r => r.status === 'PASS').length;
  console.log(`${passed} out of ${results.length} tests passed.`);
}

auditAuth();
