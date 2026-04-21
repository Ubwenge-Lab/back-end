import { IsString, IsNumber, IsOptional, IsEnum, IsBoolean } from "class-validator";
import {ApiProperty} from "@nestjs/swagger"

export class PharmacyLocationDto {
    @ApiProperty()
    @IsString()
    id: string;

    @ApiProperty()
    @IsString()
    name: string;

    @ApiProperty()
    @IsString()
    address: string;

    @ApiProperty()
    @IsNumber()
    latitude: number;

    @ApiProperty()
    @IsNumber()
    longitude: number;

    @ApiProperty()
    @IsString()
    phone : string;

    @ApiProperty()
    @IsString()
    region: string;

    @ApiProperty({enum: ['OPEN','CLOSED']})
    @IsEnum(['OPEN','CLOSED'])
    status: 'OPEN' | 'CLOSED';

    @ApiProperty()
    @IsBoolean()
    isActive: boolean;  
    
    @ApiProperty()
    @IsNumber()
    @IsOptional()
    distance?: number;

    @ApiProperty()
    @IsString()
    hours: string;

    @ApiProperty()
    @IsNumber() 
    rating: number;
    
}