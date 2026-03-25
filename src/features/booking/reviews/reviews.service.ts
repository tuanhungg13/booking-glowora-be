import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateReviewDto) {
    const apt = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
    });
    if (!apt) throw new NotFoundException('Appointment not found');
    const existing = await this.prisma.review.findUnique({
      where: { appointmentId: dto.appointmentId },
    });
    if (existing) throw new ConflictException('Appointment already reviewed');
    if (dto.rating < 1 || dto.rating > 5) {
      throw new ConflictException('Rating must be between 1 and 5');
    }
    return this.prisma.review.create({
      data: {
        appointmentId: dto.appointmentId,
        userId: apt.customerId,
        rating: dto.rating,
        comment: dto.comment,
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        appointment: {
          include: {
            customer: true,
            items: {
              include: {
                service: true,
                combo: true,
                staff: { select: { id: true, fullName: true, email: true } },
              },
            },
          },
        },
      },
    });
  }

  async findAll(params?: { userId?: string; skip?: number; take?: number }) {
    const where = params?.userId ? { userId: params.userId } : undefined;
    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip: params?.skip,
        take: params?.take ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          appointment: {
            include: {
              customer: true,
              items: {
                include: { service: true, combo: true },
              },
            },
          },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        appointment: {
          include: {
            customer: true,
            items: {
              include: {
                service: true,
                combo: true,
                staff: { select: { id: true, fullName: true, email: true } },
              },
            },
          },
        },
      },
    });
    if (!review) throw new NotFoundException('Review not found');
    return review;
  }

  async update(id: string, dto: UpdateReviewDto) {
    await this.findOne(id);
    if (dto.rating !== undefined && (dto.rating < 1 || dto.rating > 5)) {
      throw new ConflictException('Rating must be between 1 and 5');
    }
    return this.prisma.review.update({
      where: { id },
      data: { rating: dto.rating, comment: dto.comment },
      include: { appointment: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.review.delete({ where: { id } });
    return { deleted: true };
  }
}
