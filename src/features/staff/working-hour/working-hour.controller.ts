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
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WorkingHourService } from './working-hour.service';
import { CreateWorkingHourDto } from './dto/create-working-hour.dto';
import { UpdateWorkingHourDto } from './dto/update-working-hour.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { StoreId } from '../../../common/decorators/store-id.decorator';
import { DayOfWeek } from '@prisma/client';

@ApiTags('staff / working-hours')
@ApiBearerAuth()
@ApiHeader({ name: 'x-store-id', description: 'ID của store', required: true })
@Controller('working-hours')
export class WorkingHourController {
  constructor(private readonly workingHourService: WorkingHourService) {}

  @ApiOperation({ summary: 'Tạo giờ làm việc cho nhân viên' })
  @ApiResponse({ status: 201, description: 'Tạo thành công' })
  @Post()
  @RequirePermissions(Permissions.WORKING_HOUR.CREATE)
  create(@StoreId() storeId: string, @Body() dto: CreateWorkingHourDto) {
    return this.workingHourService.create({ ...dto, storeId });
  }

  @ApiOperation({ summary: 'Lấy danh sách giờ làm việc' })
  @ApiQuery({ name: 'dayOfWeek', enum: DayOfWeek, required: false, description: 'Lọc theo ngày trong tuần' })
  @ApiResponse({ status: 200, description: 'Danh sách giờ làm việc' })
  @Get()
  @RequirePermissions(Permissions.WORKING_HOUR.VIEW)
  findAll(@StoreId() storeId: string, @Query('dayOfWeek') dayOfWeek?: DayOfWeek) {
    return this.workingHourService.findAll({ storeId, dayOfWeek });
  }

  @ApiOperation({ summary: 'Lấy chi tiết giờ làm việc' })
  @ApiParam({ name: 'id', description: 'Working hour ID' })
  @ApiResponse({ status: 200, description: 'Chi tiết giờ làm việc' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy' })
  @Get(':id')
  @RequirePermissions(Permissions.WORKING_HOUR.VIEW)
  findOne(@Param('id') id: string) {
    return this.workingHourService.findOne(id);
  }

  @ApiOperation({ summary: 'Cập nhật giờ làm việc' })
  @ApiParam({ name: 'id', description: 'Working hour ID' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy' })
  @Patch(':id')
  @RequirePermissions(Permissions.WORKING_HOUR.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateWorkingHourDto) {
    return this.workingHourService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xóa giờ làm việc' })
  @ApiParam({ name: 'id', description: 'Working hour ID' })
  @ApiResponse({ status: 200, description: 'Xóa thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy' })
  @Delete(':id')
  @RequirePermissions(Permissions.WORKING_HOUR.DELETE)
  remove(@Param('id') id: string) {
    return this.workingHourService.remove(id);
  }
}
