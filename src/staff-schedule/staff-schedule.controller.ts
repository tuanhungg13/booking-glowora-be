import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { StaffScheduleService } from './staff-schedule.service';
import { CreateStaffScheduleDto } from './dto/create-staff-schedule.dto';
import { UpdateStaffScheduleDto } from './dto/update-staff-schedule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DayOfWeek } from '@prisma/client';

@Controller('staff-schedules')
@UseGuards(JwtAuthGuard)
export class StaffScheduleController {
  constructor(private readonly staffScheduleService: StaffScheduleService) {}

  @Post()
  create(@Body() dto: CreateStaffScheduleDto) {
    return this.staffScheduleService.create(dto);
  }

  @Get()
  findAll(
    @Query('staffId') staffId?: string,
    @Query('dayOfWeek') dayOfWeek?: DayOfWeek,
  ) {
    return this.staffScheduleService.findAll({ staffId, dayOfWeek });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.staffScheduleService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStaffScheduleDto) {
    return this.staffScheduleService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.staffScheduleService.remove(id);
  }
}
