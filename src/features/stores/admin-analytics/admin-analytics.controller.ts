import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminAnalyticsQueryDto, AdminTopStoresQueryDto } from './dto/admin-analytics-query.dto';

@ApiTags('admin/analytics')
@ApiBearerAuth()
@Controller('admin/analytics')
@RequirePermissions(Permissions.REPORT.VIEW)
export class AdminAnalyticsController {
  constructor(private readonly analyticsService: AdminAnalyticsService) { }

  @Get('overview')
  @ApiOperation({ summary: 'KPIs tổng quan toàn hệ thống trong khoảng thời gian' })
  getOverview(@Query() query: AdminAnalyticsQueryDto) {
    return this.analyticsService.getOverview(query.from, query.to);
  }

  @Get('stores')
  @ApiOperation({ summary: 'Biểu đồ số store đăng ký theo ngày/tuần/tháng kèm breakdown status' })
  getStoreTrend(@Query() query: AdminAnalyticsQueryDto) {
    return this.analyticsService.getStoreTrend(query.from, query.to, query.groupBy ?? 'day');
  }

  @Get('users')
  @ApiOperation({ summary: 'Biểu đồ số user đăng ký theo ngày/tuần/tháng kèm breakdown status' })
  getUserTrend(@Query() query: AdminAnalyticsQueryDto) {
    return this.analyticsService.getUserTrend(query.from, query.to, query.groupBy ?? 'day');
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Biểu đồ doanh thu toàn platform theo ngày/tuần/tháng' })
  getRevenueTrend(@Query() query: AdminAnalyticsQueryDto) {
    return this.analyticsService.getRevenueTrend(query.from, query.to, query.groupBy ?? 'day');
  }

  @Get('top-stores')
  @ApiOperation({ summary: 'Top store có doanh thu cao nhất trong khoảng thời gian' })
  getTopStores(@Query() query: AdminTopStoresQueryDto) {
    return this.analyticsService.getTopStores(query.from, query.to, query.limit ?? 10);
  }
}
