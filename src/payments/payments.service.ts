import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentStatus } from '@prisma/client';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePaymentDto) {
    const apt = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
    });
    if (!apt) throw new NotFoundException('Appointment not found');
    const existing = await this.prisma.payment.findUnique({
      where: { appointmentId: dto.appointmentId },
    });
    if (existing) throw new NotFoundException('Appointment already has a payment');
    return this.prisma.payment.create({
      data: {
        appointmentId: dto.appointmentId,
        method: dto.method,
        amount: dto.amount,
        status: dto.status ?? PaymentStatus.PENDING,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
      },
      include: { appointment: true },
    });
  }

  async findAll(params?: { status?: PaymentStatus; skip?: number; take?: number }) {
    const where = params?.status ? { status: params.status } : undefined;
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip: params?.skip,
        take: params?.take ?? 20,
        orderBy: { id: 'desc' },
        include: { appointment: { include: { customer: true, staff: true } } },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(id: string) {
    const pay = await this.prisma.payment.findUnique({
      where: { id },
      include: { appointment: { include: { customer: true, staff: true, service: true, combo: true } } },
    });
    if (!pay) throw new NotFoundException('Payment not found');
    return pay;
  }

  async update(id: string, dto: UpdatePaymentDto) {
    await this.findOne(id);
    return this.prisma.payment.update({
      where: { id },
      data: {
        method: dto.method,
        amount: dto.amount,
        status: dto.status,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
      },
      include: { appointment: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.payment.delete({ where: { id } });
    return { deleted: true };
  }
}
