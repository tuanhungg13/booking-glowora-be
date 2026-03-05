import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffDayOffDto } from './dto/create-staff-day-off.dto';
import { UpdateStaffDayOffDto } from './dto/update-staff-day-off.dto';

@Injectable()
export class StaffDayOffService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStaffDayOffDto) {
    return this.prisma.staffDayOff.create({
      data: {
        staffId: dto.staffId,
        date: new Date(dto.date),
        reason: dto.reason,
      },
      include: { staff: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async findAll(params?: { staffId?: string; from?: Date; to?: Date }) {
    const where: Record<string, unknown> = {};
    if (params?.staffId) where.staffId = params.staffId;
    if (params?.from || params?.to) {
      where.date = {};
      if (params.from) (where.date as Record<string, Date>).gte = params.from;
      if (params.to) (where.date as Record<string, Date>).lte = params.to;
    }
    return this.prisma.staffDayOff.findMany({
      where,
      orderBy: { date: 'asc' },
      include: { staff: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async findOne(id: string) {
    const dayOff = await this.prisma.staffDayOff.findUnique({
      where: { id },
      include: { staff: { select: { id: true, fullName: true, email: true, phone: true } } },
    });
    if (!dayOff) throw new NotFoundException('Staff day off not found');
    return dayOff;
  }

  async update(id: string, dto: UpdateStaffDayOffDto) {
    await this.findOne(id);
    return this.prisma.staffDayOff.update({
      where: { id },
      data: {
        date: dto.date ? new Date(dto.date) : undefined,
        reason: dto.reason,
      },
      include: { staff: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.staffDayOff.delete({ where: { id } });
    return { deleted: true };
  }
}
