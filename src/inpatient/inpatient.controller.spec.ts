import { Test, TestingModule } from '@nestjs/testing';
import { InpatientController } from './inpatient.controller';
import { InpatientService } from './inpatient.service';
import { BedStatus } from '@prisma/client';

describe('InpatientController', () => {
  let controller: InpatientController;
  let service: InpatientService;

  const mockReq = {
    user: { sub: 'user-123', role: 'NURSE', id: 'user-123' },
  };

  const mockInpatientService = {
    createAdmission: jest.fn(),
    listAdmissions: jest.fn(),
    getAdmission: jest.fn(),
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
    service = module.get<InpatientService>(InpatientService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Admissions', () => {
    it('should create an admission', async () => {
      const dto = { patientId: 'p-1', hospitalId: 'h-1', reason: 'Fever' };
      mockInpatientService.createAdmission.mockResolvedValue('admission_created');

      const result = await controller.createAdmission(mockReq, dto as any);
      expect(service.createAdmission).toHaveBeenCalledWith(mockReq.user.sub, mockReq.user.role, dto);
      expect(result).toBe('admission_created');
    });

    it('should discharge an admission', async () => {
      const dto = { clinicalClearance: true, billingClearance: true, notes: 'Clear' };
      mockInpatientService.dischargeAdmission.mockResolvedValue('discharged');

      const result = await controller.dischargeAdmission(mockReq, 'adm-1', dto);
      expect(service.dischargeAdmission).toHaveBeenCalledWith('adm-1', mockReq.user.sub, mockReq.user.role, dto);
      expect(result).toBe('discharged');
    });
  });

  describe('Beds and Occupancy', () => {
    it('should update bed status', async () => {
      const dto = { status: BedStatus.MAINTENANCE };
      mockInpatientService.updateBedStatus.mockResolvedValue('status_updated');

      const result = await controller.updateBedStatus('bed-1', dto);
      expect(service.updateBedStatus).toHaveBeenCalledWith('bed-1', dto);
      expect(result).toBe('status_updated');
    });

    it('should transfer a bed', async () => {
      const dto = { targetBedId: 'bed-2', reason: 'Patient requested' };
      mockInpatientService.transferBed.mockResolvedValue('transferred');

      const result = await controller.transferBed('adm-1', mockReq, dto);
      expect(service.transferBed).toHaveBeenCalledWith('adm-1', mockReq.user.id, dto);
      expect(result).toBe('transferred');
    });

    it('should get hospital occupancy overview', async () => {
      mockInpatientService.getHospitalOccupancyOverview.mockResolvedValue('occupancy_data');

      const result = await controller.getHospitalOccupancyOverview('h-1');
      expect(service.getHospitalOccupancyOverview).toHaveBeenCalledWith('h-1');
      expect(result).toBe('occupancy_data');
    });
  });

  describe('Vitals, MAR, and Handover', () => {
    it('should log vitals', async () => {
      const dto = { readings: {}, checklist: {} };
      mockInpatientService.logVitals.mockResolvedValue('vitals_logged');

      const result = await controller.logVitals(mockReq, 'adm-1', dto as any);
      expect(service.logVitals).toHaveBeenCalledWith('adm-1', mockReq.user.sub, dto);
      expect(result).toBe('vitals_logged');
    });

    it('should log MAR', async () => {
      const dto = { medicationName: 'Paracetamol', dose: '500mg', administeredAt: new Date() };
      mockInpatientService.logMar.mockResolvedValue('mar_logged');

      const result = await controller.logMar(mockReq, 'adm-1', dto as any);
      expect(service.logMar).toHaveBeenCalledWith('adm-1', mockReq.user.sub, dto);
      expect(result).toBe('mar_logged');
    });

    it('should acknowledge handover', async () => {
      mockInpatientService.acknowledgeHandover.mockResolvedValue('acknowledged');

      const result = await controller.acknowledgeHandover(mockReq, 'adm-1', 'handover-1');
      expect(service.acknowledgeHandover).toHaveBeenCalledWith('adm-1', 'handover-1', mockReq.user.sub);
      expect(result).toBe('acknowledged');
    });
  });
});