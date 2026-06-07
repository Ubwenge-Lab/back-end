import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SymptomCheckDto {
  @ApiProperty({
    description: 'Patient symptoms described in natural language',
    example: 'I have severe chest pain and heart palpitations.',
  })
  @IsString()
  @IsNotEmpty()
  symptoms: string;
}
