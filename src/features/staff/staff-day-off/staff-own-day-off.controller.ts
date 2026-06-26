import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StaffDayOffService } from './staff-day-off.service';
import { CreateStaffDayOffDto } from './dto/create-staff-day-off.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { StoreId } from '../../../common/decorators/store-id.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

@ApiTags('staff / day-off')
@ApiBearerAuth()
@ApiHeader({ name: 'x-store-id', description: 'ID của store', required: true })
@Controller('staff/me/day-off')
export class StaffOwnDayOffController {
  constructor(private readonly staffDayOffService: StaffDayOffService) {}

  @ApiOperation({ summary: 'Nhân viên tự đăng ký ngày nghỉ cho bản thân' })
  @Post()
  @RequirePermissions(Permissions.STAFF_DAY_OFF.REQUEST_OWN)
  requestOwn(
    @StoreId() storeId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateStaffDayOffDto,
  ) {
    return this.staffDayOffService.requestOwn(storeId, user.id, dto);
  }
}
