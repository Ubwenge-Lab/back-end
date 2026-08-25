import { Test, TestingModule } from '@nestjs/testing';
import { BedStatus } from '@prisma/client';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { InpatientController } from './inpatient.controller';
import { InpatientService } from './inpatient.service';

describe('InpatientController', () => {
  let controller: InpatientController;

  const mockReq = {
    user: { sub: 'user-123', role: Role.NURSE },
  };

  const mockInpatientService = {
    createAdmission: jest.fn(),
    listAdmissions: jest.fn(),
    getAdmission: jest.fn(),
    grantClinicalClearance: jest.fn(),
    dischargeAdmission: jest.fn(),
    logVitals: jest.fn(),
    listVitals: jest.fn(),
    logMar: jest.fn(),
    listMar: jest.fn(),
    createHandover: jest.fn(),
    listHandovers: jest.fn(),
    acknowledgeHandover: jest.fn(),
    updateBedStatus: jest.fn(),
    transferBed: jest.fn(),
    getHospitalOccupancyOverview: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InpatientController],
      providers: [
        {
          provide: InpatientService,
          useValue: mockInpatientService,
        },
      ],
    }).compile();

    controller = module.get<InpatientController>(InpatientController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('admissions', () => {
    it('creates an admission with the authenticated actor', async () => {
      const dto = {
        patientId: 'p-1',
        hospitalId: 'h-1',
        reason: 'Fever',
      };
      mockInpatientService.createAdmission.mockResolvedValue(
        'admission_created',
      );

      const result = await controller.createAdmission(mockReq, dto);

      expect(mockInpatientService.createAdmission).toHaveBeenCalledWith(
        mockReq.user.sub,
        mockReq.user.role,
        dto,
      );
      expect(result).toBe('admission_created');
    });

    it('records clinical clearance using the authenticated doctor', async () => {
      mockInpatientService.grantClinicalClearance.mockResolvedValue('cleared');

      const result = await controller.grantClinicalClearance(mockReq, 'adm-1');

      expect(mockInpatientService.grantClinicalClearance).toHaveBeenCalledWith(
        'adm-1',
        mockReq.user.sub,
        mockReq.user.role,
      );
      expect(result).toBe('cleared');
    });

    it('discharges without accepting caller-supplied clearance flags', async () => {
      const dto = { notes: 'Clear' };
      mockInpatientService.dischargeAdmission.mockResolvedValue('discharged');

      const result = await controller.dischargeAdmission(mockReq, 'adm-1', dto);

      expect(mockInpatientService.dischargeAdmission).toHaveBeenCalledWith(
        'adm-1',
        mockReq.user.sub,
        mockReq.user.role,
        dto,
      );
      expect(result).toBe('discharged');
    });
  });

  describe('beds and occupancy', () => {
    it('updates bed status using the authenticated actor', async () => {
      const dto = { status: BedStatus.MAINTENANCE };
      mockInpatientService.updateBedStatus.mockResolvedValue('status_updated');

      const result = await controller.updateBedStatus(mockReq, 'bed-1', dto);

      expect(mockInpatientService.updateBedStatus).toHaveBeenCalledWith(
        mockReq.user.sub,
        mockReq.user.role,
        'bed-1',
        dto,
      );
      expect(result).toBe('status_updated');
    });

    it('transfers a bed using the authenticated actor', async () => {
      const dto = { targetBedId: 'bed-2', reason: 'Patient requested' };
      mockInpatientService.transferBed.mockResolvedValue('transferred');

      const result = await controller.transferBed('adm-1', mockReq, dto);

      expect(mockInpatientService.transferBed).toHaveBeenCalledWith(
        'adm-1',
        mockReq.user.sub,
        mockReq.user.role,
        dto,
      );
      expect(result).toBe('transferred');
    });

    it('gets occupancy using the authenticated actor', async () => {
      mockInpatientService.getHospitalOccupancyOverview.mockResolvedValue(
        'occupancy_data',
      );

      const result = await controller.getHospitalOccupancyOverview(
        mockReq,
        'h-1',
      );

      expect(
        mockInpatientService.getHospitalOccupancyOverview,
      ).toHaveBeenCalledWith(mockReq.user.sub, mockReq.user.role, 'h-1');
      expect(result).toBe('occupancy_data');
    });

    it.each([
      ['grantClinicalClearance', [Role.DOCTOR]],
      ['updateBedStatus', [Role.NURSE, Role.HOSPITAL_ADMIN]],
      ['transferBed', [Role.DOCTOR, Role.NURSE, Role.HOSPITAL_ADMIN]],
      [
        'getHospitalOccupancyOverview',
        [Role.DOCTOR, Role.NURSE, Role.HOSPITAL_ADMIN],
      ],
    ])('protects %s with explicit roles', (methodName, expectedRoles) => {
      const handler =
        InpatientController.prototype[methodName as keyof InpatientController];

      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(expectedRoles);
    });
  });

  describe('vitals, MAR, and handover', () => {
    it('logs vitals', async () => {
      const dto = {
        readings: [],
        checklist: {
          temperatureChecked: true,
          bloodPressureChecked: true,
          heartRateChecked: true,
          oxygenSaturationChecked: true,
          respiratoryRateChecked: true,
        },
      };
      mockInpatientService.logVitals.mockResolvedValue('vitals_logged');

      const result = await controller.logVitals(mockReq, 'adm-1', dto);

      expect(mockInpatientService.logVitals).toHaveBeenCalledWith(
        'adm-1',
        mockReq.user.sub,
        dto,
      );
      expect(result).toBe('vitals_logged');
    });

    it('logs MAR', async () => {
      const dto = {
        medicationName: 'Paracetamol',
        dose: '500mg',
        route: 'oral',
        administeredAt: new Date().toISOString(),
      };
      mockInpatientService.logMar.mockResolvedValue('mar_logged');

      const result = await controller.logMar(mockReq, 'adm-1', dto);

      expect(mockInpatientService.logMar).toHaveBeenCalledWith(
        'adm-1',
        mockReq.user.sub,
        dto,
      );
      expect(result).toBe('mar_logged');
    });

    it('acknowledges handover', async () => {
      mockInpatientService.acknowledgeHandover.mockResolvedValue(
        'acknowledged',
      );

      const result = await controller.acknowledgeHandover(
        mockReq,
        'adm-1',
        'handover-1',
      );

      expect(mockInpatientService.acknowledgeHandover).toHaveBeenCalledWith(
        'adm-1',
        'handover-1',
        mockReq.user.sub,
      );
      expect(result).toBe('acknowledged');
    });
  });
});
