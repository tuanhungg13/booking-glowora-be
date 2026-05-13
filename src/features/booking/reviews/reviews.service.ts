import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

const reviewInclude = {
  customer: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
  store: true,
  service: true,
  staff: { include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } } },
  appointment: true,
} as const;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateReviewDto, customerId?: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (customerId && appointment.customerId !== customerId) {
      throw new BadRequestException('Cannot review another customer appointment');
    }
    if (appointment.status !== AppointmentStatus.COMPLETED) {
      throw new BadRequestException('Only completed appointments can be reviewed');
    }
    const existing = await this.prisma.review.findUnique({
      where: { appointmentId: dto.appointmentId },
    });
    if (existing) throw new ConflictException('Appointment already reviewed');

    const review = await this.prisma.review.create({
      data: {
        appointmentId: appointment.id,
        customerId: appointment.customerId,
        storeId: appointment.storeId,
        serviceId: appointment.serviceId,
        staffId: appointment.staffId,
        rating: dto.rating,
        comment: dto.comment,
      },
      include: reviewInclude,
    });

    await this.recalculateRatings(appointment.storeId, appointment.serviceId, appointment.staffId);
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

  async findOne(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: reviewInclude,
    });
    if (!review) throw new NotFoundException('Review not found');
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

  private async recalculateRatings(storeId: string, serviceId: string, staffId?: string | null) {
    const [storeAggregate, serviceAggregate] = await Promise.all([
      this.prisma.review.aggregate({
        where: { storeId, isVisible: true },
        _avg: { rating: true },
        _count: { rating: true },
      }),
      this.prisma.review.aggregate({
        where: { serviceId, isVisible: true },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);

    await Promise.all([
      this.prisma.store.update({
        where: { id: storeId },
        data: {
          avgRating: storeAggregate._avg.rating ?? 0,
          totalReviews: storeAggregate._count.rating,
        },
      }),
      this.prisma.service.update({
        where: { id: serviceId },
        data: { avgRating: serviceAggregate._avg.rating ?? 0 },
      }),
    ]);

    if (staffId) {
      const staffAggregate = await this.prisma.review.aggregate({
        where: { staffId, isVisible: true },
        _avg: { rating: true },
        _count: { rating: true },
      });
      await this.prisma.staff.update({
        where: { id: staffId },
        data: {
          rating: staffAggregate._avg.rating ?? 0,
          totalReviews: staffAggregate._count.rating,
        },
      });
    }
  }
}
