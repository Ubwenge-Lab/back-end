
import { IsNotEmpty, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class ReconcileClaimDto {
    @ApiProperty({
        description: 'The actual amount settled/paid by the insurance company',
        example: 12000
    })
    @IsNotEmpty()
    @IsNumber()
    @Min(0)
    settledAmount: number;
}