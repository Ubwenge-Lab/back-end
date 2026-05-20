import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { UserRole, AppointmentStatus } from '@prisma/client';

describe('Hospital Dashboard Stats (e2e)', () => {
  jest.setTimeout(60000);
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let hospitalAdminUser: any;
  let otherAdminUser: any;
  let emptyHospitalAdminUser: any;
  let testHospital: any;
  let emptyHospital: any;
  
  let adminToken: string;
  let otherAdminToken: string;
  let emptyAdminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    // Clean up any test users/hospitals first
    await prisma.hospitalInvoiceItem.deleteMany({
      where: {
        invoice: {
          hospital: {
            name: { startsWith: 'TEST_STATS_' }
          }
        }
      }
    });

    await prisma.hospitalInvoice.deleteMany({
      where: {
        hospital: {
          name: { startsWith: 'TEST_STATS_' }
        }
      }
    });

    await prisma.appointment.deleteMany({
      where: {
        hospital: {
          name: { startsWith: 'TEST_STATS_' }
        }
      }
    });

    await prisma.hospitalPatientRegistration.deleteMany({
      where: {
        hospital: {
          name: { startsWith: 'TEST_STATS_' }
        }
      }
    });

    await prisma.doctorSchedule.deleteMany({
      where: {
        doctor: {
          hospital: {
            name: { startsWith: 'TEST_STATS_' }
          }
        }
      }
    });

    await prisma.doctor.deleteMany({
      where: {
        hospital: {
          name: { startsWith: 'TEST_STATS_' }
        }
      }
    });

    await prisma.hospital.deleteMany({
      where: {
        name: { startsWith: 'TEST_STATS_' }
      }
    });

    await prisma.user.deleteMany({
      where: {
        email: { startsWith: 'test_stats_' }
      }
    });

    // Create 1st hospital admin user
    hospitalAdminUser = await prisma.user.create({
      data: {
        email: 'test_stats_admin1@hospital.com',
        password: 'hashedpassword',
        role: UserRole.HOSPITAL_ADMIN,
        isVerified: true,
      },
    });

    // Create 2nd hospital admin user (for forbidden tests)
    otherAdminUser = await prisma.user.create({
      data: {
        email: 'test_stats_admin2@hospital.com',
        password: 'hashedpassword',
        role: UserRole.HOSPITAL_ADMIN,
        isVerified: true,
      },
    });

    // Create hospital 1 (owned by user 1)
    testHospital = await prisma.hospital.create({
      data: {
        userId: hospitalAdminUser.id,
        name: 'TEST_STATS_Hospital_1',
        address: 'Kigali, Rwanda',
        phone: '+250788000000',
      },
    });

    // Create 3rd hospital admin user (for empty hospital)
    emptyHospitalAdminUser = await prisma.user.create({
      data: {
        email: 'test_stats_admin_empty@hospital.com',
        password: 'hashedpassword',
        role: UserRole.HOSPITAL_ADMIN,
        isVerified: true,
      },
    });

    // Create hospital 2 (empty hospital, owned by emptyHospitalAdminUser)
    emptyHospital = await prisma.hospital.create({
      data: {
        userId: emptyHospitalAdminUser.id,
        name: 'TEST_STATS_Hospital_Empty',
        address: 'Kigali, Rwanda',
        phone: '+250788111111',
      },
    });

    // Generate tokens
    adminToken = jwtService.sign({ sub: hospitalAdminUser.id, role: hospitalAdminUser.role });
    otherAdminToken = jwtService.sign({ sub: otherAdminUser.id, role: otherAdminUser.role });
    emptyAdminToken = jwtService.sign({ sub: emptyHospitalAdminUser.id, role: emptyHospitalAdminUser.role });

    // Seed data for testHospital:
    // 1. Doctors (1 active/available, 1 inactive/unavailable)
    const docUser1 = await prisma.user.create({
      data: {
        email: 'test_stats_doc1@hospital.com',
        password: 'hashedpassword',
        role: UserRole.DOCTOR,
        isVerified: true,
      },
    });
    const doctor1 = await (prisma.doctor.create as any)({
      data: {
        user: { connect: { id: docUser1.id } },
        hospital: { connect: { id: testHospital.id } },
        specialization: 'Cardiology',
        licenseNumber: 'TEST-LIC-1',
        isAvailable: true,
      },
    });

    const docUser2 = await prisma.user.create({
      data: {
        email: 'test_stats_doc2@hospital.com',
        password: 'hashedpassword',
        role: UserRole.DOCTOR,
        isVerified: true,
      },
    });
    const doctor2 = await (prisma.doctor.create as any)({
      data: {
        user: { connect: { id: docUser2.id } },
        hospital: { connect: { id: testHospital.id } },
        specialization: 'Pediatrics',
        licenseNumber: 'TEST-LIC-2',
        isAvailable: false,
      },
    });

    // 2. Patient
    const patientUser = await prisma.user.create({
      data: {
        email: 'test_stats_patient@patient.com',
        password: 'hashedpassword',
        role: UserRole.PATIENT,
        isVerified: true,
      },
    });
    const patient = await prisma.patient.create({
      data: {
        userId: patientUser.id,
        firstName: 'Test',
        lastName: 'Patient',
        phone: '+250788999999',
      },
    });

    // Register Patient at testHospital
    await prisma.hospitalPatientRegistration.create({
      data: {
        patientId: patient.id,
        hospitalId: testHospital.id,
        mrn: 'TEST-MRN-999',
      },
    });

    // 3. Appointments (past and future)
    const now = new Date();
    const pastDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5);
    const futureDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5);

    const apptCompleted = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        doctorId: doctor1.id,
        hospitalId: testHospital.id,
        date: pastDate,
        status: AppointmentStatus.COMPLETED,
        reason: 'Checkup',
      },
    });

    const apptPending = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        doctorId: doctor1.id,
        hospitalId: testHospital.id,
        date: futureDate,
        status: AppointmentStatus.SCHEDULED, // Mapped to PENDING in stats controller
        reason: 'Consultation',
      },
    });

    // 4. Hospital Invoices
    await prisma.hospitalInvoice.create({
      data: {
        hospitalId: testHospital.id,
        patientId: patient.id,
        appointmentId: apptCompleted.id,
        totalAmount: 10000,
        paymentStatus: 'PAID',
        issuedAt: pastDate,
        items: {
          create: {
            description: 'Consultation Fee',
            quantity: 1,
            unitCost: 10000,
            subtotal: 10000,
          },
        },
      },
    });
  });

  afterAll(async () => {
    // Clean up
    await prisma.hospitalInvoiceItem.deleteMany({
      where: {
        invoice: {
          hospital: {
            name: { startsWith: 'TEST_STATS_' }
          }
        }
      }
    });

    await prisma.hospitalInvoice.deleteMany({
      where: {
        hospital: {
          name: { startsWith: 'TEST_STATS_' }
        }
      }
    });

    await prisma.appointment.deleteMany({
      where: {
        hospital: {
          name: { startsWith: 'TEST_STATS_' }
        }
      }
    });

    await prisma.hospitalPatientRegistration.deleteMany({
      where: {
        hospital: {
          name: { startsWith: 'TEST_STATS_' }
        }
      }
    });

    await prisma.doctorSchedule.deleteMany({
      where: {
        doctor: {
          hospital: {
            name: { startsWith: 'TEST_STATS_' }
          }
        }
      }
    });

    await prisma.doctor.deleteMany({
      where: {
        hospital: {
          name: { startsWith: 'TEST_STATS_' }
        }
      }
    });

    await prisma.hospital.deleteMany({
      where: {
        name: { startsWith: 'TEST_STATS_' }
      }
    });

    await prisma.user.deleteMany({
      where: {
        email: { startsWith: 'test_stats_' }
      }
    });

    await app.close();
  });

  describe('GET /api/hospitals/:id/dashboard/stats', () => {
    it('should successfully return aggregated stats for the hospital', async () => {
      const response = await request(app.getHttpServer())
        .get(`/hospitals/${testHospital.id}/dashboard/stats`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = response.body;
      expect(data).toHaveProperty('totalAppointments');
      expect(data).toHaveProperty('appointmentsByStatus');
      expect(data).toHaveProperty('totalRevenue');
      expect(data).toHaveProperty('monthlyRevenue');
      expect(data).toHaveProperty('totalDoctors');
      expect(data).toHaveProperty('activeDoctors');
      expect(data).toHaveProperty('totalPatients');

      expect(data.totalDoctors).toBe(2);
      expect(data.activeDoctors).toBe(1);
      expect(data.totalPatients).toBe(1);
      expect(data.totalRevenue).toBe(10000);
      expect(data.appointmentsByStatus.COMPLETED).toBe(1);
      expect(data.appointmentsByStatus.PENDING).toBe(1); // Mapped from SCHEDULED
    });

    it('should return correct zero values when no data exists (empty hospital)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/hospitals/${emptyHospital.id}/dashboard/stats`)
        .set('Authorization', `Bearer ${emptyAdminToken}`)
        .expect(200);

      const data = response.body;
      expect(data.totalAppointments).toEqual({ allTime: 0, thisMonth: 0 });
      expect(data.totalRevenue).toBe(0);
      expect(data.monthlyRevenue).toBe(0);
      expect(data.totalDoctors).toBe(0);
      expect(data.activeDoctors).toBe(0);
      expect(data.totalPatients).toBe(0);
      expect(data.appointmentsByStatus.PENDING).toBe(0);
      expect(data.appointmentsByStatus.CONFIRMED).toBe(0);
      expect(data.appointmentsByStatus.COMPLETED).toBe(0);
      expect(data.appointmentsByStatus.CANCELLED).toBe(0);
    });

    it('should return 403 Forbidden if accessed by non-owner admin', async () => {
      await request(app.getHttpServer())
        .get(`/hospitals/${testHospital.id}/dashboard/stats`)
        .set('Authorization', `Bearer ${otherAdminToken}`)
        .expect(403);
    });

    it('should return 404 Not Found if hospital does not exist', async () => {
      await request(app.getHttpServer())
        .get(`/hospitals/00000000-0000-0000-0000-000000000000/dashboard/stats`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('GET /api/hospitals/:id/dashboard/daily-appointments', () => {
    it('should return last 30 days grouped by day', async () => {
      const response = await request(app.getHttpServer())
        .get(`/hospitals/${testHospital.id}/dashboard/daily-appointments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(30);

      // Verify structure
      const dayEntry = response.body[0];
      expect(dayEntry).toHaveProperty('date');
      expect(dayEntry).toHaveProperty('label');
      expect(dayEntry).toHaveProperty('count');
    });

    it('should return 403 Forbidden if accessed by non-owner admin', async () => {
      await request(app.getHttpServer())
        .get(`/hospitals/${testHospital.id}/dashboard/daily-appointments`)
        .set('Authorization', `Bearer ${otherAdminToken}`)
        .expect(403);
    });
  });

  describe('GET /api/hospitals/:id/dashboard/weekly-revenue', () => {
    it('should return last 4 weeks grouped by week', async () => {
      const response = await request(app.getHttpServer())
        .get(`/hospitals/${testHospital.id}/dashboard/weekly-revenue`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(4);

      // Verify structure
      const weekEntry = response.body[0];
      expect(weekEntry).toHaveProperty('label');
      expect(weekEntry).toHaveProperty('revenue');
    });

    it('should return 403 Forbidden if accessed by non-owner admin', async () => {
      await request(app.getHttpServer())
        .get(`/hospitals/${testHospital.id}/dashboard/weekly-revenue`)
        .set('Authorization', `Bearer ${otherAdminToken}`)
        .expect(403);
    });
  });
});
