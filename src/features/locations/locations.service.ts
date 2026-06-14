import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  findAllProvinces() {
    return this.prisma.province.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async findWardsByProvince(provinceId: number) {
    const province = await this.prisma.province.findUnique({ where: { id: provinceId } });
    if (!province) throw new NotFoundException('Không tìm thấy tỉnh/thành phố');

    const wards = await this.prisma.ward.findMany({
      where: { provinceId },
      orderBy: { name: 'asc' },
    });
    return { province, wards };
  }
}
