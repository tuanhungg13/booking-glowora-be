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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewFilterDto } from './dto/review-filter.dto';

@ApiTags('reviews')
@Controller('')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // ─── Public read endpoints (register BEFORE parameterized routes) ───

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

  @ApiOperation({ summary: 'Review của một lịch hẹn (public)' })
  @Public()
  @Get('appointments/:appointmentId/review')
  findByAppointment(@Param('appointmentId') appointmentId: string) {
    return this.reviewsService.findByAppointment(appointmentId);
  }

  // ─── Customer: tạo review ───

  @ApiOperation({ summary: 'Đánh giá lịch hẹn đã hoàn thành' })
  @ApiBearerAuth()
  @Post('appointments/:appointmentId/review')
  @RequirePermissions(Permissions.REVIEW.CREATE)
  createForAppointment(
    @Param('appointmentId') appointmentId: string,
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.reviewsService.create(dto, user.id, appointmentId);
  }

  // ─── Admin: ẩn/hiện review ───

  @ApiOperation({ summary: 'Ẩn review vi phạm (SUPER_ADMIN)' })
  @ApiBearerAuth()
  @Patch('admin/reviews/:id/hide')
  @RequirePermissions(Permissions.REVIEW.MANAGE)
  hide(@Param('id') id: string) {
    return this.reviewsService.toggleVisibility(id, false);
  }

  @ApiOperation({ summary: 'Hiện lại review (SUPER_ADMIN)' })
  @ApiBearerAuth()
  @Patch('admin/reviews/:id/show')
  @RequirePermissions(Permissions.REVIEW.MANAGE)
  show(@Param('id') id: string) {
    return this.reviewsService.toggleVisibility(id, true);
  }

  // ─── CRUD cơ bản ───

  @ApiOperation({ summary: 'Tạo review (legacy — dùng POST /appointments/:id/review)' })
  @ApiBearerAuth()
  @Post('reviews')
  @RequirePermissions(Permissions.REVIEW.CREATE)
  create(@Body() dto: CreateReviewDto, @CurrentUser() user: CurrentUserPayload) {
    return this.reviewsService.create(dto, user.id);
  }

  @ApiOperation({ summary: 'Danh sách reviews (admin)' })
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
