import { ApiProperty } from '@nestjs/swagger';

export class HospitalDto {
  @ApiProperty({ example: 'uuid-here' })
  id: string;

  @ApiProperty({ example: 'King Faisal Hospital' })
  name: string;

  @ApiProperty({ example: 'KG 544 St, Kigali' })
  address: string;

  @ApiProperty({ example: '+250788000000' })
  phone: string;

  @ApiProperty({ example: 'info@kfh.rw' })
  email: string;

  @ApiProperty({ example: 'RW-HOSP-2024-001' })
  licenseNumber: string;

  @ApiProperty()
  createdAt: Date;
}
