import { Test, TestingModule } from '@nestjs/testing';
import { PrescriptionsController } from './prescriptions.controller';
import { PrescriptionsService } from './prescriptions.service';
import { FulfillmentStatus } from './dto/external-fulfillment-webhook.dto';
import { ConfigService } from '@nestjs/config';

describe('PrescriptionsController', () => {
  let controller: PrescriptionsController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      emitHospitalDigitalPrescription: jest.fn(),
      dispatchExternal: jest.fn(),
      processExternalFulfillment: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PrescriptionsController],
      providers: [
        { provide: PrescriptionsService, useValue: serviceMock },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<PrescriptionsController>(PrescriptionsController);
  });

  describe('issueHospitalPrescription', () => {
    it('should delegate prescription creation to PrescriptionsService', async () => {
      const req = { user: { sub: 'doctor-user-id' } };
      const dto: any = {
        hospitalId: 'hosp-1',
        patientId: 'pat-1',
        medications: [],
      };
      const expectedResult = { prescription: { id: 'PRESC-1' }, summary: {} };

      serviceMock.emitHospitalDigitalPrescription.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.issueHospitalPrescription(
        req as any,
        dto,
      );

      expect(serviceMock.emitHospitalDigitalPrescription).toHaveBeenCalledWith(
        'doctor-user-id',
        dto,
      );
      expect(result).toBe(expectedResult);
    });
  });

  describe('dispatchExternal', () => {
    it('should trigger external pharmacy dispatch', async () => {
      const expectedResult = { message: 'Dispatched 1 item(s)', orders: [] };
      serviceMock.dispatchExternal.mockResolvedValue(expectedResult);

      const result = await controller.dispatchExternal('presc-123');

      expect(serviceMock.dispatchExternal).toHaveBeenCalledWith('presc-123');
      expect(result).toBe(expectedResult);
    });
  });

  describe('handleExternalFulfillment', () => {
    it('should process incoming external fulfillment webhooks', async () => {
      const dto = {
        prescriptionId: 'presc-123',
        pharmacyId: 'pharm-1',
        prescriptionMedicationIds: ['pm-1'],
        status: FulfillmentStatus.FULFILLED,
      };

      const expectedResult = {
        message: 'Fulfillment callback processed successfully',
      };
      serviceMock.processExternalFulfillment.mockResolvedValue(expectedResult);

      const result = await controller.handleExternalFulfillment(dto);

      expect(serviceMock.processExternalFulfillment).toHaveBeenCalledWith(dto);
      expect(result).toBe(expectedResult);
    });
  });
});
