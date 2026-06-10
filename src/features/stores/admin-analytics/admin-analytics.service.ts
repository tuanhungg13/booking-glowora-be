import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { vnDateRange } from '../../../common/utils/date.util';

type GroupBy = 'day' | 'week' | 'month';

function dateFormat(groupBy: GroupBy): string {
  if (groupBy === 'week') return '%Y-%u';
  if (groupBy === 'month') return '%Y-%m';
  return '%Y-%m-%d';
}

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(from: string, to: string) {
    const { fromDate, toDate } = vnDateRange(from, to);

    const [
      allStoreStats,          // Tổng tất cả store (không lọc ngày)
      allUserStats,           // Tổng tất cả user (không lọc ngày)
      newStoreCount,          // Store mới tạo trong kỳ
      newUserCount,           // User mới tạo trong kỳ
      bookingStats,           // Lịch hẹn theo scheduled_at trong kỳ
      revenueAgg,             // Doanh thu theo paid_at trong kỳ
      reviewAgg,              // Đánh giá trong kỳ
      paidBookingCountRows,   // Số booking thực sự có payment trong kỳ
    ] = await Promise.all([
      // ALL-TIME: tổng cửa hàng theo trạng thái hiện tại
      this.prisma.store.groupBy({
        by: ['status'],
        _count: { id: true },
      }),

      // ALL-TIME: tổng người dùng theo trạng thái hiện tại
      this.prisma.user.groupBy({
        by: ['status'],
        _count: { id: true },
      }),

      // Cửa hàng đăng ký mới trong kỳ
      this.prisma.store.count({
        where: { createdAt: { gte: fromDate, lte: toDate } },
      }),

      // Người dùng đăng ký mới trong kỳ
      this.prisma.user.count({
        where: { createdAt: { gte: fromDate, lte: toDate } },
      }),

      // Lịch hẹn (theo ngày hẹn) trong kỳ
      this.prisma.booking.groupBy({
        by: ['status'],
        where: { scheduledAt: { gte: fromDate, lte: toDate } },
        _count: { id: true },
      }),

      // Doanh thu từ payments đã thanh toán trong kỳ
      this.prisma.payment.aggregate({
        where: {
          status: 'PAID',
          paidAt: { gte: fromDate, lte: toDate },
        },
        _sum: { amount: true },
      }),

      // Đánh giá trong kỳ
      this.prisma.review.aggregate({
        where: {
          createdAt: { gte: fromDate, lte: toDate },
          isVisible: true,
        },
        _avg: { rating: true },
        _count: { id: true },
      }),

      // Đếm distinct booking có payment trong kỳ
      this.prisma.$queryRawUnsafe<{ count: string }[]>(
        `SELECT COUNT(DISTINCT booking_id) AS count
         FROM payments
         WHERE status = 'PAID'
           AND paid_at >= ?
           AND paid_at <= ?`,
        fromDate, toDate,
      ),
    ]);

    const storeMap: Record<string, number> = {};
    for (const g of allStoreStats) storeMap[g.status] = g._count.id;

    const userMap: Record<string, number> = {};
    for (const g of allUserStats) userMap[g.status] = g._count.id;

    const bookingMap: Record<string, number> = {};
    for (const g of bookingStats) bookingMap[g.status] = g._count.id;

    const totalStores = Object.values(storeMap).reduce((a, b) => a + b, 0);
    const totalUsers = Object.values(userMap).reduce((a, b) => a + b, 0);
    const totalBookings = Object.values(bookingMap).reduce((a, b) => a + b, 0);

    return {
      stores: {
        total: totalStores,
        active: storeMap['ACTIVE'] ?? 0,
        pending: storeMap['PENDING'] ?? 0,
        banned: storeMap['BANNED'] ?? 0,
        inactive: storeMap['INACTIVE'] ?? 0,
        newInPeriod: newStoreCount,
      },
      users: {
        total: totalUsers,
        active: userMap['ACTIVE'] ?? 0,
        banned: userMap['BANNED'] ?? 0,
        inactive: userMap['INACTIVE'] ?? 0,
        suspended: userMap['SUSPENDED'] ?? 0,
        newInPeriod: newUserCount,
      },
      bookings: {
        total: totalBookings,
        completed: bookingMap['COMPLETED'] ?? 0,
        confirmed: bookingMap['CONFIRMED'] ?? 0,
        pending: bookingMap['PENDING'] ?? 0,
        cancelled: bookingMap['CANCELLED'] ?? 0,
        rejected: bookingMap['REJECTED'] ?? 0,
      },
      revenue: Number(revenueAgg._sum.amount ?? 0),
      paidBookingCount: Number(paidBookingCountRows[0]?.count ?? 0),
      reviews: {
        total: reviewAgg._count.id,
        avgRating: reviewAgg._avg.rating
          ? Number(Number(reviewAgg._avg.rating).toFixed(2))
          : null,
      },
    };
  }

  async getStoreTrend(from: string, to: string, groupBy: GroupBy) {
    const { fromDate, toDate } = vnDateRange(from, to);

    const fmt = dateFormat(groupBy);

    // Trả về số cửa hàng đăng ký mới theo từng kỳ (không breakdown status — tránh gây hiểu nhầm)
    const rows = await this.prisma.$queryRawUnsafe<
      { period: string; total: string }[]
    >(
      `SELECT
         DATE_FORMAT(created_at, ?) AS period,
         COUNT(*)                   AS total
       FROM stores
       WHERE created_at >= ? AND created_at <= ?
       GROUP BY period
       ORDER BY period ASC`,
      fmt,
      fromDate,
      toDate,
    );

    return rows.map((r) => ({
      period: r.period,
      total: Number(r.total),
    }));
  }

  async getUserTrend(from: string, to: string, groupBy: GroupBy) {
    const { fromDate, toDate } = vnDateRange(from, to);

    const fmt = dateFormat(groupBy);

    // Trả về số người dùng đăng ký mới theo từng kỳ (không breakdown status)
    const rows = await this.prisma.$queryRawUnsafe<
      { period: string; total: string }[]
    >(
      `SELECT
         DATE_FORMAT(created_at, ?) AS period,
         COUNT(*)                   AS total
       FROM users
       WHERE created_at >= ? AND created_at <= ?
       GROUP BY period
       ORDER BY period ASC`,
      fmt,
      fromDate,
      toDate,
    );

    return rows.map((r) => ({
      period: r.period,
      total: Number(r.total),
    }));
  }

  async getRevenueTrend(from: string, to: string, groupBy: GroupBy) {
    const { fromDate, toDate } = vnDateRange(from, to);

    const fmt = dateFormat(groupBy);

    const rows = await this.prisma.$queryRawUnsafe<
      { period: string; revenue: string; booking_count: string }[]
    >(
      `SELECT
         DATE_FORMAT(paid_at, ?) AS period,
         SUM(amount)             AS revenue,
         COUNT(DISTINCT booking_id) AS booking_count
       FROM payments
       WHERE status = 'PAID'
         AND paid_at >= ?
         AND paid_at <= ?
       GROUP BY period
       ORDER BY period ASC`,
      fmt,
      fromDate,
      toDate,
    );

    return rows.map((r) => ({
      period: r.period,
      revenue: Number(r.revenue),
      bookingCount: Number(r.booking_count),
    }));
  }

  async getTopStores(from: string, to: string, limit: number) {
    const { fromDate, toDate } = vnDateRange(from, to);

    const rows = await this.prisma.$queryRawUnsafe<
      {
        store_id: string;
        store_name: string;
        logo_url: string | null;
        avg_rating: string;
        revenue: string;
        booking_count: string;
      }[]
    >(
      `SELECT
         s.id                         AS store_id,
         s.name                       AS store_name,
         s.logo_url                   AS logo_url,
         s.avg_rating                 AS avg_rating,
         SUM(p.amount)                AS revenue,
         COUNT(DISTINCT p.booking_id) AS booking_count
       FROM payments p
       JOIN bookings b ON b.id = p.booking_id
       JOIN stores s   ON s.id = b.store_id
       WHERE p.status = 'PAID'
         AND p.paid_at >= ?
         AND p.paid_at <= ?
       GROUP BY s.id, s.name, s.logo_url, s.avg_rating
       ORDER BY revenue DESC
       LIMIT ?`,
      fromDate,
      toDate,
      limit,
    );

    return rows.map((r, index) => ({
      rank: index + 1,
      storeId: r.store_id,
      name: r.store_name,
      logoUrl: r.logo_url,
      revenue: Number(r.revenue),
      bookingCount: Number(r.booking_count),
      avgRating: Number(Number(r.avg_rating).toFixed(2)),
    }));
  }
}
