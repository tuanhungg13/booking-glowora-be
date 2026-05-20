import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { StaffScheduleService } from './staff-schedule.service';
import { CreateStaffScheduleDto } from './dto/create-staff-schedule.dto';
import { UpdateStaffScheduleDto } from './dto/update-staff-schedule.dto';
import { BulkUpsertScheduleDto } from './dto/bulk-upsert-schedule.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { ShopId } from '../../../common/decorators/shop-id.decorator';
import { DayOfWeek } from '@prisma/client';

@Controller('staff/:staffId/schedules')
export class StaffScheduleController {
  constructor(private readonly staffScheduleService: StaffScheduleService) {}

  @Post()
  @RequirePermissions(Permissions.STAFF_SCHEDULE.CREATE)
  create(
    @ShopId() storeId: string,
    @Param('staffId') staffId: string,
    @Body() dto: CreateStaffScheduleDto,
  ) {
    return this.staffScheduleService.create(storeId, staffId, dto);
  }

  @Put()
  @RequirePermissions(Permissions.STAFF_SCHEDULE.UPDATE)
  bulkUpsert(
    @ShopId() storeId: string,
    @Param('staffId') staffId: string,
    @Body() dto: BulkUpsertScheduleDto,
  ) {
    return this.staffScheduleService.bulkUpsert(storeId, staffId, dto.schedules);
  }

  @Get()
  @RequirePermissions(Permissions.STAFF_SCHEDULE.VIEW)
  findAll(
    @ShopId() storeId: string,
    @Param('staffId') staffId: string,
    @Query('dayOfWeek') dayOfWeek?: DayOfWeek,
  ) {
    return this.staffScheduleService.findAll(storeId, staffId, dayOfWeek);
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
