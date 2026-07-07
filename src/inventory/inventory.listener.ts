import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InventoryService } from './inventory.service';

@Injectable()
export class InventoryListener {
  private readonly logger = new Logger(InventoryListener.name);

  constructor(private readonly inventoryService: InventoryService) {}

  // We set async: true so it doesn't block the HTTP response of the diagnostic completion
  @OnEvent('diagnostic.completed', { async: true })
  async handleDiagnosticCompletedEvent(payload: { orderId: string }) {
    this.logger.log(`Received diagnostic.completed event for order ${payload.orderId}`);
    
    try {
      await this.inventoryService.deductConsumablesForDiagnostic(payload.orderId);
    } catch (error) {
      // Catching the error here ensures the listener doesn't crash the Node process
      // if the database transaction fails.
      this.logger.error(
        `Failed to deduct inventory for order ${payload.orderId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}