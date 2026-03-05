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
import { WorkingHourService } from './working-hour.service';
import { CreateWorkingHourDto } from './dto/create-working-hour.dto';
import { UpdateWorkingHourDto } from './dto/update-working-hour.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { DayOfWeek } from '@prisma/client';

@Controller('working-hours')
export class WorkingHourController {
  constructor(private readonly workingHourService: WorkingHourService) {}

  @Post()
  @RequirePermissions(Permissions.WORKING_HOUR.CREATE)
  create(@Body() dto: CreateWorkingHourDto) {
    return this.workingHourService.create(dto);
  }

  @Get()
  @RequirePermissions(Permissions.WORKING_HOUR.VIEW)
  findAll(@Query('dayOfWeek') dayOfWeek?: DayOfWeek) {
    return this.workingHourService.findAll({ dayOfWeek });
  }

  @Get(':id')
  @RequirePermissions(Permissions.WORKING_HOUR.VIEW)
  findOne(@Param('id') id: string) {
    return this.workingHourService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.WORKING_HOUR.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateWorkingHourDto) {
    return this.workingHourService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.WORKING_HOUR.DELETE)
  remove(@Param('id') id: string) {
    return this.workingHourService.remove(id);
  }
}
