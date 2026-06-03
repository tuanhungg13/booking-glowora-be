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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { AuditLog } from '../../../common/decorators/audit-log.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewFilterDto } from './dto/review-filter.dto';
import { LogType } from '@prisma/client';

@ApiTags('reviews')
@Controller('')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // ─── Public read endpoints ────────────────────────────────────────────────

  @ApiOperation({ summary: 'Reviews của một store (public)' })
  @Public()
  @Get('stores/:storeId/reviews')
  findByStore(@Param('storeId') storeId: string, @Query() filter: ReviewFilterDto) {
    return this.reviewsService.findByStore(storeId, filter);
  }

  @ApiOperation({ summary: 'Reviews của một service (public)' })
  @Public()
  @Get('services/:serviceId/reviews')
  findByService(@Param('serviceId') serviceId: string, @Query() filter: ReviewFilterDto) {
    return this.reviewsService.findByService(serviceId, filter);
  }

  @ApiOperation({ summary: 'Review của một booking item (public)' })
  @Public()
  @Get('booking-items/:bookingItemId/review')
  findByBookingItem(@Param('bookingItemId') bookingItemId: string) {
    return this.reviewsService.findByBookingItem(bookingItemId);
  }

  // ─── Customer: tạo review cho từng dịch vụ trong booking ─────────────────

  @ApiOperation({ summary: 'Đánh giá một dịch vụ trong booking đã hoàn thành' })
  @ApiBearerAuth()
  @Post('booking-items/:bookingItemId/review')
  @RequirePermissions(Permissions.REVIEW.CREATE)
  createForBookingItem(
    @Param('bookingItemId') bookingItemId: string,
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.reviewsService.create(dto, user.id, bookingItemId);
  }

  // ─── Admin: ẩn/hiện review ────────────────────────────────────────────────

  @ApiOperation({ summary: 'Ẩn review vi phạm (SUPER_ADMIN)' })
  @ApiBearerAuth()
  @Patch('admin/reviews/:id/hide')
  @RequirePermissions(Permissions.REVIEW.MANAGE)
  @AuditLog({ type: LogType.REVIEW_HIDDEN, targetType: 'Review' })
  hide(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.reviewsService.toggleVisibility(id, false, user.id);
  }

  @ApiOperation({ summary: 'Hiện lại review (SUPER_ADMIN)' })
  @ApiBearerAuth()
  @Patch('admin/reviews/:id/show')
  @RequirePermissions(Permissions.REVIEW.MANAGE)
  @AuditLog({ type: LogType.REVIEW_SHOWN, targetType: 'Review' })
  show(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.reviewsService.toggleVisibility(id, true, user.id);
  }

  // ─── CRUD cơ bản ─────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Tạo review (dùng POST /booking-items/:id/review)' })
  @ApiBearerAuth()
  @Post('reviews')
  @RequirePermissions(Permissions.REVIEW.CREATE)
  create(@Body() dto: CreateReviewDto, @CurrentUser() user: CurrentUserPayload) {
    return this.reviewsService.create(dto, user.id);
  }

  @ApiOperation({ summary: 'Danh sách reviews (admin)' })
  @ApiQuery({ name: 'customerId', required: false, description: 'Lọc theo ID khách hàng' })
  @ApiQuery({ name: 'storeId', required: false, description: 'Lọc theo ID store' })
  @ApiQuery({ name: 'serviceId', required: false, description: 'Lọc theo ID dịch vụ' })
  @ApiQuery({ name: 'skip', required: false, type: Number, description: 'Số bản ghi bỏ qua' })
  @ApiQuery({ name: 'take', required: false, type: Number, description: 'Số bản ghi lấy về' })
  @ApiBearerAuth()
  @Get('reviews')
  @RequirePermissions(Permissions.REVIEW.VIEW)
  findAll(
    @Query('customerId') customerId?: string,
    @Query('storeId') storeId?: string,
    @Query('serviceId') serviceId?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.reviewsService.findAll({
      customerId,
      storeId,
      serviceId,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @ApiOperation({ summary: 'Chi tiết review' })
  @ApiBearerAuth()
  @Get('reviews/:id')
  @RequirePermissions(Permissions.REVIEW.VIEW)
  findOne(@Param('id') id: string) {
    return this.reviewsService.findOne(id);
  }

  @ApiOperation({ summary: 'Cập nhật review' })
  @ApiBearerAuth()
  @Patch('reviews/:id')
  @RequirePermissions(Permissions.REVIEW.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateReviewDto) {
    return this.reviewsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xóa review' })
  @ApiBearerAuth()
  @Delete('reviews/:id')
  @RequirePermissions(Permissions.REVIEW.DELETE)
  remove(@Param('id') id: string) {
    return this.reviewsService.remove(id);
  }
}
