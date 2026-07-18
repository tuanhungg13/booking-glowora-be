import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewFilterDto } from './dto/review-filter.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

const reviewInclude = {
  customer: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
  store: true,
  service: true,
  staff: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
  bookingItem: { include: { booking: { select: { id: true, scheduledAt: true } } } },
} as const;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(dto: CreateReviewDto, customerId?: string, bookingItemIdOverride?: string) {
    const itemId = bookingItemIdOverride ?? dto.bookingItemId;
    if (!itemId) throw new BadRequestException('Thiếu thông tin bookingItemId');

    const bookingItem = await this.prisma.bookingItem.findUnique({
      where: { id: itemId },
      include: { booking: true },
    });
    if (!bookingItem) throw new NotFoundException('Không tìm thấy dịch vụ trong lịch đặt');
    if (!bookingItem.booking.customerId) {
      throw new BadRequestException('Lịch hẹn vãng lai không hỗ trợ đánh giá');
    }
    if (customerId && bookingItem.booking.customerId !== customerId) {
      throw new BadRequestException('Không thể đánh giá lịch đặt của người khác');
    }
    if (bookingItem.booking.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException('Chỉ đánh giá sau khi dịch vụ hoàn thành');
    }

    const existing = await this.prisma.review.findUnique({
      where: { bookingItemId: itemId },
    });
    if (existing) throw new ConflictException('Bạn đã đánh giá dịch vụ này rồi');

    const review = await this.prisma.$transaction(async (tx) => {
      const r = await tx.review.create({
        data: {
          bookingItemId: itemId,
          bookingId: bookingItem.bookingId,
          customerId: bookingItem.booking.customerId!,
          storeId: bookingItem.booking.storeId,
          serviceId: bookingItem.serviceId,
          serviceName: bookingItem.serviceName,
          staffId: bookingItem.staffId,
          rating: dto.rating,
          comment: dto.comment,
          ...(dto.imageUrls ? { imageUrls: dto.imageUrls } : {}),
        },
        include: reviewInclude,
      });
      await this.recalculateRatings(
        bookingItem.booking.storeId,
        bookingItem.serviceId,
        bookingItem.staffId,
        tx,
      );
      return r;
    });

    return review;
  }

  async findAll(params?: { customerId?: string; storeId?: string; serviceId?: string; skip?: number; take?: number }) {
    const where: Prisma.ReviewWhereInput = {
      ...(params?.customerId && { customerId: params.customerId }),
      ...(params?.storeId && { storeId: params.storeId }),
      ...(params?.serviceId && { serviceId: params.serviceId }),
    };
    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip: params?.skip,
        take: params?.take ?? 20,
        orderBy: { createdAt: 'desc' },
        include: reviewInclude,
      }),
      this.prisma.review.count({ where }),
    ]);
    return { items, total };
  }

  async findByStore(storeId: string, filter: ReviewFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;
    const where: Prisma.ReviewWhereInput = {
      storeId,
      isVisible: true,
      ...(filter.rating ? { rating: filter.rating } : {}),
      ...(filter.serviceId ? { serviceId: filter.serviceId } : {}),
    };

    const [items, total, breakdown] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          customer: { select: { fullName: true, avatarUrl: true } },
          service: { select: { name: true } },
          staff: { include: { user: { select: { fullName: true } } } },
        },
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { storeId, isVisible: true },
        _count: { rating: true },
      }),
    ]);

    const breakdownMap = Object.fromEntries(
      [1, 2, 3, 4, 5].map((r) => [r, breakdown.find((b) => b.rating === r)?._count.rating ?? 0]),
    );

    return { items, total, page, limit, breakdown: breakdownMap };
  }

  async findByService(serviceId: string, filter: ReviewFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;
    const where: Prisma.ReviewWhereInput = {
      serviceId,
      isVisible: true,
      ...(filter.rating ? { rating: filter.rating } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          customer: { select: { fullName: true, avatarUrl: true } },
          staff: { include: { user: { select: { fullName: true } } } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findByBookingItem(bookingItemId: string) {
    return this.prisma.review.findUnique({
      where: { bookingItemId },
      include: reviewInclude,
    });
  }

  async findOne(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: reviewInclude,
    });
    if (!review) throw new NotFoundException('Không tìm thấy đánh giá');
    return review;
  }

  async update(id: string, dto: UpdateReviewDto) {
    const existing = await this.findOne(id);
    const review = await this.prisma.review.update({
      where: { id },
      data: { rating: dto.rating, comment: dto.comment, isVisible: dto.isVisible },
      include: reviewInclude,
    });
    await this.recalculateRatings(existing.storeId, existing.serviceId, existing.staffId);
    return review;
  }

  async remove(id: string) {
    const existing = await this.findOne(id);
    await this.prisma.review.delete({ where: { id } });
    await this.recalculateRatings(existing.storeId, existing.serviceId, existing.staffId);
    return { deleted: true };
  }

  async toggleVisibility(id: string, isVisible: boolean, actorId?: string) {
    const existing = await this.findOne(id);
    const review = await this.prisma.$transaction(async (tx) => {
      const r = await tx.review.update({
        where: { id },
        data: { isVisible },
        include: reviewInclude,
      });
      await this.recalculateRatings(existing.storeId, existing.serviceId, existing.staffId, tx);
      return r;
    });
    return review;
  }

  private async recalculateRatings(
    storeId: string,
    serviceId: string | null,
    staffId?: string | null,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;

    const [storeAggregate, serviceAggregate] = await Promise.all([
      db.review.aggregate({ where: { storeId, isVisible: true }, _avg: { rating: true }, _count: { rating: true } }),
      serviceId
        ? db.review.aggregate({ where: { serviceId, isVisible: true }, _avg: { rating: true }, _count: { rating: true } })
        : null,
    ]);

    await Promise.all([
      db.store.update({
        where: { id: storeId },
        data: { avgRating: storeAggregate._avg.rating ?? 0, totalReviews: storeAggregate._count.rating },
      }),
      serviceId && serviceAggregate
        ? db.service.update({
            where: { id: serviceId },
            data: { avgRating: serviceAggregate._avg.rating ?? 0 },
          })
        : null,
    ]);

    if (staffId) {
      const staffAggregate = await db.review.aggregate({
        where: { staffId, isVisible: true },
        _avg: { rating: true },
        _count: { rating: true },
      });
      await db.staff.update({
        where: { id: staffId },
        data: { rating: staffAggregate._avg.rating ?? 0, totalReviews: staffAggregate._count.rating },
      });
    }
  }
}
