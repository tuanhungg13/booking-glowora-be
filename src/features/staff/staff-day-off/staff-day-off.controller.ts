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
import { StaffDayOffService } from './staff-day-off.service';
import { CreateStaffDayOffDto } from './dto/create-staff-day-off.dto';
import { UpdateStaffDayOffDto } from './dto/update-staff-day-off.dto';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';

@Controller('staff-days-off')
@UseGuards(JwtAuthGuard)
export class StaffDayOffController {
  constructor(private readonly staffDayOffService: StaffDayOffService) {}

  @Post()
  create(@Body() dto: CreateStaffDayOffDto) {
    return this.staffDayOffService.create(dto);
  }

  @Get()
  findAll(
    @Query('staffId') staffId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.staffDayOffService.findAll({
      staffId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.staffDayOffService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStaffDayOffDto) {
    return this.staffDayOffService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.staffDayOffService.remove(id);
  }
}
