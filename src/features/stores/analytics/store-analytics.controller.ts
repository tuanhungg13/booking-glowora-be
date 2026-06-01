import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { ShopId } from '../../../common/decorators/shop-id.decorator';
import { StoreAnalyticsService } from './store-analytics.service';
import { AnalyticsQueryDto, TopServicesQueryDto } from './dto/analytics-query.dto';

@ApiTags('store-analytics')
@ApiBearerAuth()
@Controller('store-analytics')
export class StoreAnalyticsController {
  constructor(private readonly analyticsService: StoreAnalyticsService) {}

  @Get('overview')
  @RequirePermissions(Permissions.REPORT.VIEW)
  @ApiOperation({ summary: 'Tổng quan doanh thu & đơn đặt lịch trong khoảng thời gian' })
  getOverview(@ShopId() storeId: string, @Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getOverview(storeId, query.from, query.to);
  }

  @Get('revenue')
  @RequirePermissions(Permissions.REPORT.VIEW)
  @ApiOperation({ summary: 'Biểu đồ doanh thu theo ngày/tuần/tháng' })
  getRevenueTrend(@ShopId() storeId: string, @Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getRevenueTrend(storeId, query.from, query.to, query.groupBy ?? 'day');
  }

  @Get('bookings')
  @RequirePermissions(Permissions.REPORT.VIEW)
  @ApiOperation({ summary: 'Biểu đồ số đơn đặt lịch theo ngày/tuần/tháng với breakdown status' })
  getBookingTrend(@ShopId() storeId: string, @Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getBookingTrend(storeId, query.from, query.to, query.groupBy ?? 'day');
  }

  @Get('top-services')
  @RequirePermissions(Permissions.REPORT.VIEW)
  @ApiOperation({ summary: 'Dịch vụ được đặt nhiều nhất trong khoảng thời gian' })
  getTopServices(@ShopId() storeId: string, @Query() query: TopServicesQueryDto) {
    return this.analyticsService.getTopServices(storeId, query.from, query.to, query.limit ?? 10);
  }
}
