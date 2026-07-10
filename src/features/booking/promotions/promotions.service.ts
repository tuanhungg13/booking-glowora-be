import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CouponType, LogType, Prisma, PromotionScope } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { SystemLogService } from '../../../system-log/system-log.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { PromotionFilterDto } from './dto/promotion-filter.dto';

const promotionInclude = {
  targetCategories: { include: { category: { select: { id: true, name: true } } } },
  targetServices: { include: { service: { select: { id: true, name: true } } } },
} as const;

@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemLog: SystemLogService,
  ) {}

  async create(dto: CreatePromotionDto, createdById: string, storeId: string) {
    if (dto.endAt && new Date(dto.endAt) <= new Date(dto.startAt)) {
      throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    }
    if (dto.type === CouponType.PERCENTAGE && (dto.value <= 0 || dto.value > 100)) {
      throw new BadRequestException('Promotion PERCENTAGE phải có value từ 1 đến 100');
    }
    if (dto.scope === PromotionScope.CATEGORY && (!dto.categoryIds || dto.categoryIds.length === 0)) {
      throw new BadRequestException('Phải chọn ít nhất 1 danh mục khi scope = CATEGORY');
    }
    if (dto.scope === PromotionScope.SERVICE && (!dto.serviceIds || dto.serviceIds.length === 0)) {
      throw new BadRequestException('Phải chọn ít nhất 1 dịch vụ khi scope = SERVICE');
    }

    if (dto.type === CouponType.FIXED) {
      await this.assertFixedValueBelowMinPrice(dto.value, dto.scope, storeId, dto.serviceIds, dto.categoryIds);
    }

    // Promotion mới mặc định isActive=true — kiểm tra trùng lịch ngay khi tạo
    await this.assertNoOverlappingActive(
      storeId,
      new Date(dto.startAt),
      dto.endAt ? new Date(dto.endAt) : null,
    );

    const promotion = await this.prisma.promotion.create({
      data: {
        storeId,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        value: dto.value,
        scope: dto.scope,
        startAt: new Date(dto.startAt),
        endAt: dto.endAt ? new Date(dto.endAt) : null,
        createdById,
        ...(dto.scope === PromotionScope.CATEGORY && dto.categoryIds && {
          targetCategories: { create: dto.categoryIds.map((categoryId) => ({ categoryId })) },
        }),
        ...(dto.scope === PromotionScope.SERVICE && dto.serviceIds && {
          targetServices: { create: dto.serviceIds.map((serviceId) => ({ serviceId })) },
        }),
      },
      include: promotionInclude,
    });

    this.systemLog.log({
      type: LogType.PROMOTION_CREATED,
      actorId: createdById,
      storeId,
      targetId: promotion.id,
      targetType: 'Promotion',
      metadata: { name: promotion.name, scope: promotion.scope },
    });

    return promotion;
  }

  async findAll(storeId: string, filter: PromotionFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PromotionWhereInput = {
      storeId,
      ...(filter.isActive !== undefined && { isActive: filter.isActive }),
      ...(filter.q && { name: { contains: filter.q } }),
      ...(filter.type && { type: filter.type }),
      ...(filter.scope && { scope: filter.scope }),
      ...(filter.to && { startAt: { lte: new Date(filter.to) } }),
      ...(filter.from && { OR: [{ endAt: { gte: new Date(filter.from) } }, { endAt: null }] }),
    };

    const [items, total] = await Promise.all([
      this.prisma.promotion.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: promotionInclude,
      }),
      this.prisma.promotion.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string, storeId: string) {
    const promotion = await this.prisma.promotion.findFirst({
      where: { id, storeId },
      include: promotionInclude,
    });
    if (!promotion) throw new NotFoundException('Promotion không tìm thấy');
    return promotion;
  }

  async findActiveForStore(storeId: string) {
    const now = new Date();
    return this.prisma.promotion.findFirst({
      where: {
        storeId,
        isActive: true,
        startAt: { lte: now },
        OR: [{ endAt: { gte: now } }, { endAt: null }],
      },
      include: promotionInclude,
      orderBy: { value: 'desc' },
    });
  }

  async update(id: string, storeId: string, dto: UpdatePromotionDto, actorId: string) {
    const promotion = await this.findOne(id, storeId);

    if (dto.endAt && new Date(dto.endAt) <= promotion.startAt) {
      throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    }

    // dto.endAt: undefined = giữ nguyên, null = xoá hạn, string = set ngày mới
    const nextEndAt = dto.endAt !== undefined ? (dto.endAt ? new Date(dto.endAt) : null) : promotion.endAt;

    if (dto.isActive === true && !promotion.isActive) {
      await this.assertNoOverlappingActive(storeId, promotion.startAt, nextEndAt, id);
    }

    const updated = await this.prisma.promotion.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.endAt !== undefined && { endAt: nextEndAt }),
      },
      include: promotionInclude,
    });

    this.systemLog.log({
      type: LogType.PROMOTION_UPDATED,
      actorId,
      storeId,
      targetId: id,
      targetType: 'Promotion',
      metadata: { name: promotion.name, changes: dto },
    });

    return updated;
  }

  async remove(id: string, storeId: string, actorId: string) {
    const promotion = await this.findOne(id, storeId);

    await this.prisma.promotion.delete({ where: { id } });

    this.systemLog.log({
      type: LogType.PROMOTION_DELETED,
      actorId,
      storeId,
      targetId: id,
      targetType: 'Promotion',
      metadata: { name: promotion.name },
    });

    return { deleted: true };
  }

  // ─── Dùng trong bookings.service và catalog services ─────────────────────

  calcDiscount(
    promotion: { type: CouponType; value: Prisma.Decimal },
    price: number,
  ): number {
    if (promotion.type === CouponType.PERCENTAGE) {
      return (price * Number(promotion.value)) / 100;
    }
    return Math.min(Number(promotion.value), price);
  }

  isServiceInScope(
    promotion: {
      scope: PromotionScope;
      targetCategories: { categoryId: string }[];
      targetServices: { serviceId: string }[];
    },
    serviceId: string,
    categoryId: string | null,
  ): boolean {
    if (promotion.scope === PromotionScope.STORE) return true;
    if (promotion.scope === PromotionScope.SERVICE) {
      return promotion.targetServices.some((t) => t.serviceId === serviceId);
    }
    if (promotion.scope === PromotionScope.CATEGORY && categoryId) {
      return promotion.targetCategories.some((t) => t.categoryId === categoryId);
    }
    return false;
  }

  assertStoreOwner(promotionStoreId: string, storeId: string) {
    if (promotionStoreId !== storeId) {
      throw new ForbiddenException('Bạn không có quyền thao tác promotion này');
    }
  }

  private async assertFixedValueBelowMinPrice(
    value: number,
    scope: PromotionScope,
    storeId: string,
    serviceIds?: string[],
    categoryIds?: string[],
  ): Promise<void> {
    const result = await this.prisma.serviceVariant.aggregate({
      _min: { price: true },
      where: {
        status: 'ACTIVE',
        service: {
          status: 'ACTIVE',
          ...(scope === PromotionScope.SERVICE && { id: { in: serviceIds } }),
          ...(scope === PromotionScope.CATEGORY && { categoryId: { in: categoryIds }, storeId }),
          ...(scope === PromotionScope.STORE && { storeId }),
        },
      },
    });

    const minPrice = result._min.price;
    if (minPrice === null) return;

    if (value >= Number(minPrice)) {
      throw new BadRequestException(
        `Giá trị giảm cố định (${value.toLocaleString('vi-VN')}đ) phải nhỏ hơn giá thấp nhất của dịch vụ áp dụng (${Number(minPrice).toLocaleString('vi-VN')}đ)`,
      );
    }
  }

  private async assertNoOverlappingActive(
    storeId: string,
    startAt: Date,
    endAt: Date | null,
    excludeId?: string,
  ): Promise<void> {
    const overlap = await this.prisma.promotion.findFirst({
      where: {
        storeId,
        isActive: true,
        ...(excludeId && { id: { not: excludeId } }),
        startAt: { lt: endAt ?? new Date('9999-12-31') },
        OR: [{ endAt: { gt: startAt } }, { endAt: null }],
      },
      select: { id: true, name: true },
    });

    if (overlap) {
      throw new BadRequestException(
        `Đã có promotion "${overlap.name}" đang chạy trong khoảng thời gian này`,
      );
    }
  }
}
