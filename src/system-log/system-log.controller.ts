import { Controller, Get, Query } from '@nestjs/common';
import { ApiPropertyOptional, ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LogType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Permissions } from '../common/constants/permissions';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemLogFilter, SystemLogService } from './system-log.service';

class SystemLogFilterDto implements SystemLogFilter {
  @ApiPropertyOptional({ enum: LogType })
  @IsOptional()
  @IsEnum(LogType)
  type?: LogType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ description: 'Tìm theo email hoặc tên user' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetType?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

@ApiTags('admin/logs')
@ApiBearerAuth()
@Controller('admin/logs')
@RequirePermissions(Permissions.LOG.VIEW)
export class SystemLogController {
  constructor(private readonly systemLogService: SystemLogService) {}

  @ApiOperation({ summary: 'Danh sách nhật ký hệ thống (admin only)' })
  @Get()
  findAll(@Query() filter: SystemLogFilterDto) {
    return this.systemLogService.findAll(filter);
  }
}
