import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { StaffScheduleService } from './staff-schedule.service';
import { CreateStaffScheduleDto } from './dto/create-staff-schedule.dto';
import { UpdateStaffScheduleDto } from './dto/update-staff-schedule.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { DayOfWeek } from '@prisma/client';

@Controller('staff-schedules')
export class StaffScheduleController {
  constructor(private readonly staffScheduleService: StaffScheduleService) {}

  @Post()
  @RequirePermissions(Permissions.STAFF_SCHEDULE.CREATE)
  create(@Body() dto: CreateStaffScheduleDto) {
    return this.staffScheduleService.create(dto);
  }

  @Get()
  @RequirePermissions(Permissions.STAFF_SCHEDULE.VIEW)
  findAll(
    @Query('staffId') staffId?: string,
    @Query('dayOfWeek') dayOfWeek?: DayOfWeek,
  ) {
    return this.staffScheduleService.findAll({ staffId, dayOfWeek });
  }

  @Get(':id')
  @RequirePermissions(Permissions.STAFF_SCHEDULE.VIEW)
  findOne(@Param('id') id: string) {
    return this.staffScheduleService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.STAFF_SCHEDULE.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateStaffScheduleDto) {
    return this.staffScheduleService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.STAFF_SCHEDULE.DELETE)
  remove(@Param('id') id: string) {
    return this.staffScheduleService.remove(id);
  }
}
