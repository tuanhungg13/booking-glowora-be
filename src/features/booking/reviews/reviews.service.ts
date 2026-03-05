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
        rating: dto.rating,
        comment: dto.comment,
      },
      include: { appointment: { include: { service: true, combo: true, staff: true } } },
    });
  }

  async findAll(params?: { skip?: number; take?: number }) {
    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        skip: params?.skip,
        take: params?.take ?? 20,
        orderBy: { createdAt: 'desc' },
        include: { appointment: { include: { customer: true, service: true, combo: true } } },
      }),
      this.prisma.review.count(),
    ]);
    return { items, total };
  }

  async findOne(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: { appointment: { include: { customer: true, staff: true, service: true, combo: true } } },
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
