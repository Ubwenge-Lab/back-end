export class UpdateTransferStatusDto {
  status: 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
  rejectionReason?: string;
  completionNotes?: string;
}
