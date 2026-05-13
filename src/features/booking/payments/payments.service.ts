import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';

const paymentInclude = {
  appointment: { include: { store: true, service: true } },
  customer: { select: { id: true, fullName: true, email: true } },
} as const;

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePaymentDto) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');

    if (dto.status === PaymentStatus.PAID) {
      const paid = await this.prisma.payment.findFirst({
        where: { appointmentId: dto.appointmentId, status: PaymentStatus.PAID },
      });
      if (paid) throw new ConflictException('Appointment already has a paid payment');
    }

    return this.prisma.payment.create({
      data: {
        appointmentId: dto.appointmentId,
        customerId: appointment.customerId,
        method: dto.method ?? PaymentMethod.VNPAY,
        amount: dto.amount ?? appointment.price,
        status: dto.status ?? PaymentStatus.PENDING,
        vnpTxnRef: dto.vnpTxnRef ?? `${dto.appointmentId}-${Date.now()}`,
        paidAt: dto.status === PaymentStatus.PAID ? new Date() : undefined,
      },
      include: paymentInclude,
    });
  }

  async findAll(params?: { status?: PaymentStatus; customerId?: string; skip?: number; take?: number }) {
    const where = {
      ...(params?.status && { status: params.status }),
      ...(params?.customerId && { customerId: params.customerId }),
    };
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip: params?.skip,
        take: params?.take ?? 20,
        orderBy: { createdAt: 'desc' },
        include: paymentInclude,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: paymentInclude,
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async findByAppointment(appointmentId: string) {
    return this.prisma.payment.findMany({
      where: { appointmentId },
      orderBy: { createdAt: 'desc' },
      include: paymentInclude,
    });
  }

  async update(id: string, dto: UpdatePaymentDto) {
    await this.findOne(id);
    return this.prisma.payment.update({
      where: { id },
      data: {
        method: dto.method,
        amount: dto.amount,
        status: dto.status,
        paidAt: dto.status === PaymentStatus.PAID ? new Date() : dto.paidAt ? new Date(dto.paidAt) : undefined,
      },
      include: paymentInclude,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.payment.delete({ where: { id } });
    return { deleted: true };
  }
}
