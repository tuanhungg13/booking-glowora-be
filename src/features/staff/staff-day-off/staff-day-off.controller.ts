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
import { StaffDayOffService } from './staff-day-off.service';
import { CreateStaffDayOffDto } from './dto/create-staff-day-off.dto';
import { UpdateStaffDayOffDto } from './dto/update-staff-day-off.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';

@Controller('stores/:storeId/staff/:staffId/day-off')
export class StaffDayOffController {
  constructor(private readonly staffDayOffService: StaffDayOffService) {}

  @Post()
  @RequirePermissions(Permissions.STAFF_DAY_OFF.CREATE)
  create(
    @Param('storeId') storeId: string,
    @Param('staffId') staffId: string,
    @Body() dto: CreateStaffDayOffDto,
  ) {
    return this.staffDayOffService.create(storeId, staffId, dto);
  }

  @Get()
  @RequirePermissions(Permissions.STAFF_DAY_OFF.VIEW)
  findAll(
    @Param('storeId') storeId: string,
    @Param('staffId') staffId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.staffDayOffService.findAll(storeId, staffId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions(Permissions.STAFF_DAY_OFF.VIEW)
  findOne(@Param('id') id: string) {
    return this.staffDayOffService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.STAFF_DAY_OFF.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateStaffDayOffDto) {
    return this.staffDayOffService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.STAFF_DAY_OFF.DELETE)
  remove(@Param('id') id: string) {
    return this.staffDayOffService.remove(id);
  }
}
