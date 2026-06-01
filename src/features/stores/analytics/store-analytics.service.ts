import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

type GroupBy = 'day' | 'week' | 'month';

function dateFormat(groupBy: GroupBy): string {
  if (groupBy === 'week') return '%Y-%u';
  if (groupBy === 'month') return '%Y-%m';
  return '%Y-%m-%d';
}

@Injectable()
export class StoreAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(storeId: string, from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const [revenueAgg, bookingStats, ratingAgg, newCustomers] = await Promise.all([
      // Tổng doanh thu từ payments đã thanh toán
      this.prisma.payment.aggregate({
        where: {
          booking: { storeId },
          status: 'PAID',
          paidAt: { gte: fromDate, lte: toDate },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),

      // Thống kê booking theo status
      this.prisma.booking.groupBy({
        by: ['status'],
        where: {
          storeId,
          scheduledAt: { gte: fromDate, lte: toDate },
        },
        _count: { id: true },
      }),

      // Trung bình rating
      this.prisma.review.aggregate({
        where: {
          storeId,
          createdAt: { gte: fromDate, lte: toDate },
          isVisible: true,
        },
        _avg: { rating: true },
        _count: { id: true },
      }),

      // Khách hàng mới (lần đầu đặt tại store trong khoảng thời gian)
      this.prisma.booking.findMany({
        where: {
          storeId,
          scheduledAt: { gte: fromDate, lte: toDate },
        },
        select: { customerId: true },
        distinct: ['customerId'],
      }),
    ]);

    const statusMap: Record<string, number> = {};
    for (const g of bookingStats) {
      statusMap[g.status] = g._count.id;
    }

    const totalBookings = Object.values(statusMap).reduce((a, b) => a + b, 0);

    return {
      revenue: Number(revenueAgg._sum.amount ?? 0),
      bookingCount: totalBookings,
      completedCount: statusMap['COMPLETED'] ?? 0,
      cancelledCount: statusMap['CANCELLED'] ?? 0,
      rejectedCount: statusMap['REJECTED'] ?? 0,
      pendingCount: statusMap['PENDING'] ?? 0,
      confirmedCount: statusMap['CONFIRMED'] ?? 0,
      avgRating: ratingAgg._avg.rating ? Number(ratingAgg._avg.rating.toFixed(2)) : null,
      reviewCount: ratingAgg._count.id,
      newCustomers: newCustomers.length,
    };
  }

  async getRevenueTrend(storeId: string, from: string, to: string, groupBy: GroupBy) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const fmt = dateFormat(groupBy);

    const rows = await this.prisma.$queryRawUnsafe<
      { period: string; revenue: string; booking_count: string }[]
    >(
      `SELECT
         DATE_FORMAT(p.paid_at, ?) AS period,
         SUM(p.amount)             AS revenue,
         COUNT(DISTINCT p.booking_id) AS booking_count
       FROM payments p
       JOIN bookings b ON b.id = p.booking_id
       WHERE b.store_id = ?
         AND p.status = 'PAID'
         AND p.paid_at >= ?
         AND p.paid_at <= ?
       GROUP BY period
       ORDER BY period ASC`,
      fmt,
      storeId,
      fromDate,
      toDate,
    );

    return rows.map((r) => ({
      period: r.period,
      revenue: Number(r.revenue),
      bookingCount: Number(r.booking_count),
    }));
  }

  async getBookingTrend(storeId: string, from: string, to: string, groupBy: GroupBy) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const fmt = dateFormat(groupBy);

    const rows = await this.prisma.$queryRawUnsafe<
      {
        period: string;
        total: string;
        completed: string;
        cancelled: string;
        rejected: string;
        pending: string;
        confirmed: string;
      }[]
    >(
      `SELECT
         DATE_FORMAT(scheduled_at, ?)                                     AS period,
         COUNT(*)                                                          AS total,
         SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END)           AS completed,
         SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END)           AS cancelled,
         SUM(CASE WHEN status = 'REJECTED'  THEN 1 ELSE 0 END)           AS rejected,
         SUM(CASE WHEN status = 'PENDING'   THEN 1 ELSE 0 END)           AS pending,
         SUM(CASE WHEN status = 'CONFIRMED' THEN 1 ELSE 0 END)           AS confirmed
       FROM bookings
       WHERE store_id = ?
         AND scheduled_at >= ?
         AND scheduled_at <= ?
       GROUP BY period
       ORDER BY period ASC`,
      fmt,
      storeId,
      fromDate,
      toDate,
    );

    return rows.map((r) => ({
      period: r.period,
      total: Number(r.total),
      completed: Number(r.completed),
      cancelled: Number(r.cancelled),
      rejected: Number(r.rejected),
      pending: Number(r.pending),
      confirmed: Number(r.confirmed),
    }));
  }

  async getTopServices(storeId: string, from: string, to: string, limit: number) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const rows = await this.prisma.$queryRawUnsafe<
      {
        service_id: string;
        service_name: string;
        booking_count: string;
        revenue: string;
        avg_rating: string | null;
      }[]
    >(
      `SELECT
         s.id                         AS service_id,
         s.name                       AS service_name,
         COUNT(bi.id)                 AS booking_count,
         SUM(bi.price)                AS revenue,
         AVG(r.rating)                AS avg_rating
       FROM booking_items bi
       JOIN bookings b  ON b.id  = bi.booking_id
       JOIN services s  ON s.id  = bi.service_id
       LEFT JOIN reviews r ON r.booking_item_id = bi.id AND r.is_visible = 1
       WHERE b.store_id = ?
         AND b.status = 'COMPLETED'
         AND b.scheduled_at >= ?
         AND b.scheduled_at <= ?
       GROUP BY s.id, s.name
       ORDER BY booking_count DESC
       LIMIT ?`,
      storeId,
      fromDate,
      toDate,
      limit,
    );

    return rows.map((r, index) => ({
      rank: index + 1,
      serviceId: r.service_id,
      name: r.service_name,
      bookingCount: Number(r.booking_count),
      revenue: Number(r.revenue),
      avgRating: r.avg_rating ? Number(Number(r.avg_rating).toFixed(2)) : null,
    }));
  }
}
