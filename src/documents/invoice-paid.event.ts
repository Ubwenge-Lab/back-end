export class InvoicePaidEvent {
  constructor(
    public readonly invoiceId: string,
    public readonly patientEmail: string,
    public readonly patientName: string,
  ) {}
}
