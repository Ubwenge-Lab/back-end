import { IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class MapDataQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by location source',
    enum: ['live', 'fixed', 'all'],
    default: 'all',
  })
  @IsOptional()
  @IsIn(['live', 'fixed', 'all'])
  @Transform(({ value }) => value ?? 'all')
  view?: 'live' | 'fixed' | 'all';

  @ApiPropertyOptional({
    description: 'Filter by Kigali district',
    enum: ['Gasabo', 'Kicukiro', 'Nyarugenge', 'Other', 'all'],
    default: 'all',
  })
  @IsOptional()
  @IsIn(['Gasabo', 'Kicukiro', 'Nyarugenge', 'Other', 'all'])
  @Transform(({ value }) => value ?? 'all')
  district?: 'Gasabo' | 'Kicukiro' | 'Nyarugenge' | 'Other' | 'all';
}
