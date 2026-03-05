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
import { WorkingHourService } from './working-hour.service';
import { CreateWorkingHourDto } from './dto/create-working-hour.dto';
import { UpdateWorkingHourDto } from './dto/update-working-hour.dto';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { DayOfWeek } from '@prisma/client';

@Controller('working-hours')
@UseGuards(JwtAuthGuard)
export class WorkingHourController {
  constructor(private readonly workingHourService: WorkingHourService) {}

  @Post()
  create(@Body() dto: CreateWorkingHourDto) {
    return this.workingHourService.create(dto);
  }

  @Get()
  findAll(@Query('dayOfWeek') dayOfWeek?: DayOfWeek) {
    return this.workingHourService.findAll({ dayOfWeek });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workingHourService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkingHourDto) {
    return this.workingHourService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workingHourService.remove(id);
  }
}
