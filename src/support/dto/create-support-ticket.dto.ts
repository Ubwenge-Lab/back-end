import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SupportTicketCategory } from '@prisma/client';

export class CreateSupportTicketDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '+250788000000', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({
    enum: SupportTicketCategory,
    example: 'technical',
  })
  @IsEnum(SupportTicketCategory)
  @IsNotEmpty()
  category: SupportTicketCategory;

  @ApiProperty({
    example: 'I am having trouble accessing my dashboard.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Message must be at least 10 characters long' })
  message: string;
}
