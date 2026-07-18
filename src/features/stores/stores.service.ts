import * as crypto from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DayOfWeek, Prisma, StaffStatus, Store, StoreStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionCacheService } from '../../redis/permission-cache.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { StoreFilterDto } from './dto/store-filter.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { UpdateWorkingHoursDto } from './dto/update-working-hours.dto';
import { UpsertPaymentConfigDto } from './dto/upsert-payment-config.dto';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { PromotionsService } from '../booking/promotions/promotions.service';

const SHOP_OWNER_ROLE_CODE = 'SHOP_OWNER';
const MAX_STORE_ROLES_PER_USER = 3;
const CLOUDINARY_IMAGE_HOST = 'res.cloudinary.com';

// Các field xác minh danh tính/giấy phép — sửa đổi những field này sau khi store
// đã ACTIVE/INACTIVE thì phải đưa store về PENDING để admin duyệt lại.
const VERIFICATION_DATE_FIELDS = ['cccdDateOfBirth', 'cccdIssueDate', 'cccdExpiryDate', 'bizIssueDate'] as const;
const VERIFICATION_TEXT_FIELDS = [
  'cccdFullName', 'citizenId', 'cccdGender', 'cccdNationality', 'cccdAddress',
  'bizName', 'bizCode', 'bizOwnerName', 'bizAddress', 'bizLine',
] as const;

const storeListInclude = {
  workingHours: { orderBy: { dayOfWeek: 'asc' as const } },
  owner: { select: { id: true, fullName: true, email: true, phone: true } },
  province: { select: { id: true, name: true, type: true } },
  ward: { select: { id: true, name: true, type: true } },
  _count: { select: { services: true, reviews: true, staff: true } },
} as const;

// Chỉ chứa các field mà trang danh sách/chi tiết store public thực sự render.
// Không dùng storeListInclude ở đây vì nó expose CCCD, giấy phép kinh doanh, và
// thông tin liên hệ riêng của owner — chỉ dành cho owner/admin xem (create/findMine/update).
const storePublicListSelect = {
  id: true,
  slug: true,
  name: true,
  address: true,
  logoUrl: true,
  bannerUrl: true,
  avgRating: true,
  totalReviews: true,
  latitude: true,
  longitude: true,
  workingHours: {
    select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
    orderBy: { dayOfWeek: 'asc' as const },
  },
  province: { select: { name: true } },
  ward: { select: { name: true } },
  _count: { select: { services: true } },
} as const;

const storePublicDetailSelect = {
  ...storePublicListSelect,
  description: true,
  phone: true,
  services: {
    where: { status: 'ACTIVE' as const },
    include: {
      category: true,
      variants: { where: { status: 'ACTIVE' as const }, orderBy: { sortOrder: 'asc' as const } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

const defaultWorkingHours = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
  DayOfWeek.SUNDAY,
].map((dayOfWeek) => ({
  dayOfWeek,
  openTime: '08:00',
  closeTime: '20:00',
  isClosed: dayOfWeek === DayOfWeek.SUNDAY,
}));

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionCache: PermissionCacheService,
    private readonly config: ConfigService,
    private readonly cloudinary: CloudinaryService,
    private readonly promotions: PromotionsService,
  ) { }

  async create(dto: CreateStoreDto, ownerId: string) {
    if (dto.provinceId) {
      const province = await this.prisma.province.findUnique({ where: { id: dto.provinceId } });
      if (!province) throw new BadRequestException('Không tìm thấy tỉnh/thành phố');
    }
    if (dto.wardId) {
      const ward = await this.prisma.ward.findUnique({ where: { id: dto.wardId } });
      if (!ward) throw new BadRequestException('Không tìm thấy phường/xã');
      if (dto.provinceId && ward.provinceId !== dto.provinceId) {
        throw new BadRequestException('Phường/xã không thuộc tỉnh/thành phố đã chọn');
      }
    }

    const existingStore = await this.prisma.store.findFirst({
      where: { name: { equals: dto.name } },
      select: { id: true },
    });
    if (existingStore) {
      throw new ConflictException(`Tên cửa hàng "${dto.name}" đã tồn tại trong hệ thống`);
    }

    const storeRoleCount = await this.prisma.userRole.count({
      where: { userId: ownerId, storeId: { not: null } },
    });
    if (storeRoleCount >= MAX_STORE_ROLES_PER_USER) {
      throw new BadRequestException('Tài khoản đã đạt giới hạn tối đa 3 cửa hàng');
    }

    const templateRole = await this.prisma.role.findFirst({
      where: { code: SHOP_OWNER_ROLE_CODE, storeId: null },
      select: { id: true },
    });
    if (!templateRole) {
      throw new BadRequestException('Thiếu vai trò mặc định SHOP_OWNER. Vui lòng chạy seed database.');
    }

    const slug = await this.generateUniqueSlug(dto.name, dto.provinceId);

    const store = await this.prisma.$transaction(async (tx) => {
      const createdStore = await tx.store.create({
        data: {
          ownerId,
          name: dto.name,
          slug,
          phone: dto.phone,
          email: dto.email,
          website: dto.website,
          description: dto.description,
          address: dto.address,
          wardId: dto.wardId,
          provinceId: dto.provinceId,
          status: StoreStatus.PENDING,
          slotIntervalMins: dto.slotIntervalMins,
          cancelBeforeHours: dto.cancelBeforeHours,
          maxAdvanceDays: dto.maxAdvanceDays,
          autoConfirm: dto.autoConfirm,
          cccdFullName: dto.cccdFullName,
          citizenId: dto.citizenId,
          cccdDateOfBirth: dto.cccdDateOfBirth ? new Date(dto.cccdDateOfBirth) : undefined,
          cccdGender: dto.cccdGender,
          cccdNationality: dto.cccdNationality,
          cccdAddress: dto.cccdAddress,
          cccdIssueDate: dto.cccdIssueDate ? new Date(dto.cccdIssueDate) : undefined,
          cccdExpiryDate: dto.cccdExpiryDate ? new Date(dto.cccdExpiryDate) : undefined,
          bizName: dto.bizName,
          bizCode: dto.bizCode,
          bizOwnerName: dto.bizOwnerName,
          bizAddress: dto.bizAddress,
          bizIssueDate: dto.bizIssueDate ? new Date(dto.bizIssueDate) : undefined,
          bizLine: dto.bizLine,
        },
      });

      await tx.workingHour.createMany({
        data: defaultWorkingHours.map((hour) => ({
          storeId: createdStore.id,
          ...hour,
        })),
      });

      await tx.userRole.create({
        data: {
          userId: ownerId,
          roleId: templateRole.id,
          storeId: createdStore.id,
        },
      });

      await tx.staff.create({
        data: {
          userId: ownerId,
          storeId: createdStore.id,
          status: StaffStatus.ACTIVE,
        },
      });

      return tx.store.findUniqueOrThrow({
        where: { id: createdStore.id },
        include: storeListInclude,
      });
    });

    await this.permissionCache.invalidateUser(ownerId);
    return store;
  }

  async findAll(filter: StoreFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 12;
    const hasLocation = filter.userLat != null && filter.userLng != null;

    if (!hasLocation || filter.sort !== 'distance') {
      const where = this.buildPublicWhere(filter);
      const orderBy = this.buildOrderBy(filter.sort);
      const [rawItems, total] = await this.prisma.$transaction([
        this.prisma.store.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit, select: storePublicListSelect }),
        this.prisma.store.count({ where }),
      ]);
      if (!hasLocation) return { items: rawItems, total, page, limit };
      const lat = filter.userLat!;
      const lng = filter.userLng!;
      const items = rawItems.map((s) => ({
        ...s,
        distance: s.latitude != null && s.longitude != null ? this.calcDistance(lat, lng, s.latitude, s.longitude) : null,
      }));
      return { items, total, page, limit };
    }

    // sort === 'distance': tính và sort hoàn toàn tại DB
    const lat = filter.userLat!;
    const lng = filter.userLng!;
    const offset = (page - 1) * limit;
    const conditions = this.buildDistanceRawConditions(filter);
    const whereClause = Prisma.join(conditions, ' AND ');
    const distanceExpr = Prisma.sql`ROUND(6371 * ACOS(LEAST(1, COS(RADIANS(${lat})) * COS(RADIANS(s.latitude)) * COS(RADIANS(s.longitude) - RADIANS(${lng})) + SIN(RADIANS(${lat})) * SIN(RADIANS(s.latitude)))), 2)`;

    const [rows, countResult] = await Promise.all([
      this.prisma.$queryRaw<{ id: string; distance: number }[]>`
        SELECT s.id, ${distanceExpr} AS distance
        FROM stores s
        WHERE ${whereClause}
        ORDER BY distance ASC
        LIMIT ${limit} OFFSET ${offset}
      `,
      this.prisma.$queryRaw<[{ total: bigint }]>`
        SELECT COUNT(*) AS total FROM stores s WHERE ${whereClause}
      `,
    ]);

    const total = Number(countResult[0].total);
    if (rows.length === 0) return { items: [], total, page, limit };

    const distanceMap = new Map(rows.map((r) => [r.id, Number(r.distance)]));
    const pageIds = rows.map((r) => r.id);
    const pageItems = await this.prisma.store.findMany({ where: { id: { in: pageIds } }, select: storePublicListSelect });
    const items = pageIds.map((id) => ({ ...pageItems.find((s) => s.id === id)!, distance: distanceMap.get(id) }));
    return { items, total, page, limit };
  }

  private buildDistanceRawConditions(filter: StoreFilterDto): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`s.status = 'ACTIVE'`,
      Prisma.sql`s.latitude IS NOT NULL`,
      Prisma.sql`s.longitude IS NOT NULL`,
    ];
    if (filter.provinceId) conditions.push(Prisma.sql`s.province_id = ${filter.provinceId}`);
    if (filter.wardId) conditions.push(Prisma.sql`s.ward_id = ${filter.wardId}`);
    if (filter.q) {
      const q = `%${filter.q}%`;
      conditions.push(Prisma.sql`(s.name LIKE ${q} OR s.address LIKE ${q} OR s.description LIKE ${q})`);
    }
    if (filter.minRating) conditions.push(Prisma.sql`s.avg_rating >= ${filter.minRating}`);
    if (filter.maxRating) conditions.push(Prisma.sql`s.avg_rating <= ${filter.maxRating}`);
    if (filter.categoryId) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM services srv
        LEFT JOIN service_categories cat ON srv.category_id = cat.id
        WHERE srv.store_id = s.id
          AND srv.status = 'ACTIVE'
          AND (srv.category_id = ${filter.categoryId} OR cat.parent_id = ${filter.categoryId})
      )`);
    }
    return conditions;
  }

  private calcDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const val = Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2) - toRad(lng1))
              + Math.sin(toRad(lat1)) * Math.sin(toRad(lat2));
    return Math.round(6371 * Math.acos(Math.min(1, val)) * 100) / 100;
  }

  async findOne(idOrSlug: string) {
    const store = await this.prisma.store.findFirst({
      where: {
        status: StoreStatus.ACTIVE,
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      select: storePublicDetailSelect,
    });
    if (!store) throw new NotFoundException('Không tìm thấy cửa hàng');

    const promotion = await this.promotions.findActiveForStore(store.id);
    if (!promotion) return store;

    const enrichedServices = store.services.map((svc) => ({
      ...svc,
      variants: svc.variants.map((v) => {
        if (!this.promotions.isServiceInScope(promotion, svc.id, svc.categoryId)) return v;
        const saving = this.promotions.calcDiscount(promotion, Number(v.price));
        return { ...v, promotionalPrice: Number(v.price) - saving, promotionSaving: saving, promotionId: promotion.id };
      }),
    }));

    return { ...store, services: enrichedServices, activePromotion: promotion };
  }

  async findMineDetail(id: string, ownerId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id },
      include: storeListInclude,
    });
    if (!store) throw new NotFoundException('Không tìm thấy cửa hàng');
    if (store.ownerId !== ownerId) {
      throw new ForbiddenException('Bạn không có quyền quản lý cửa hàng này');
    }
    return this.mapStoreOwnerView(store);
  }

  async findMyStores(userId: string) {
    const memberships = await this.prisma.userRole.findMany({
      where: { userId, storeId: { not: null } },
      include: {
        role: { select: { id: true, name: true, code: true } },
        store: {
          select: { id: true, name: true, slug: true, logoUrl: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return memberships
      .filter((m) => m.store !== null)
      .map((m) => ({
        storeId: m.store!.id,
        name: m.store!.name,
        slug: m.store!.slug,
        logoUrl: m.store!.logoUrl,
        status: m.store!.status,
        roleId: m.role.id,
        roleCode: m.role.code,
        roleName: m.role.name,
      }));
  }

  async update(id: string, ownerId: string, dto: UpdateStoreDto) {
    const store = await this.checkOwnership(id, ownerId);

    if (dto.depositPercent !== undefined && dto.depositPercent > 0) {
      const paymentConfig = await this.prisma.storePaymentConfig.findUnique({
        where: { storeId: id },
        select: { isActive: true },
      });
      if (!paymentConfig?.isActive) {
        throw new BadRequestException('Cần cấu hình tài khoản thanh toán trước khi bật yêu cầu đặt cọc');
      }
    }

    if (dto.name && dto.name !== store.name) {
      const duplicate = await this.prisma.store.findFirst({
        where: { name: { equals: dto.name }, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException(`Tên cửa hàng "${dto.name}" đã tồn tại trong hệ thống`);
    }

    const slug = dto.name && dto.name !== store.name
      ? await this.generateUniqueSlug(dto.name, dto.provinceId ?? store.provinceId ?? undefined)
      : undefined;

    const changedVerificationFields = this.hasVerificationChange(dto, store);

    return this.mapStoreOwnerView(
      await this.prisma.store.update({
        where: { id },
        data: {
          ...dto,
          ...(slug && { slug }),
          ...(changedVerificationFields && this.reverificationData(store.status)),
        },
        include: storeListInclude,
      }),
    );
  }

  async updateWorkingHours(id: string, ownerId: string, dto: UpdateWorkingHoursDto) {
    await this.checkOwnership(id, ownerId);
    this.assertValidWorkingHours(dto);

    await this.prisma.$transaction(async (tx) => {
      for (const hour of dto.hours) {
        await tx.workingHour.upsert({
          where: { storeId_dayOfWeek: { storeId: id, dayOfWeek: hour.dayOfWeek } },
          update: {
            openTime: hour.openTime,
            closeTime: hour.closeTime,
            isClosed: hour.isClosed,
          },
          create: {
            storeId: id,
            dayOfWeek: hour.dayOfWeek,
            openTime: hour.openTime,
            closeTime: hour.closeTime,
            isClosed: hour.isClosed,
          },
        });
      }
    });

    return this.prisma.workingHour.findMany({
      where: { storeId: id },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async uploadLogo(id: string, ownerId: string, file: Express.Multer.File) {
    const store = await this.checkOwnership(id, ownerId);
    const logoUrl = await this.cloudinary.uploadImage(file, `glowora/stores/${id}/logo`);
    const updated = await this.prisma.store.update({
      where: { id },
      data: { logoUrl },
      select: { id: true, logoUrl: true },
    });
    await this.deleteCloudinaryImageIfPresent(store.logoUrl).catch(() => undefined);
    return updated;
  }

  async uploadBanner(id: string, ownerId: string, file: Express.Multer.File) {
    const store = await this.checkOwnership(id, ownerId);
    const bannerUrl = await this.cloudinary.uploadImage(file, `glowora/stores/${id}/banner`);
    const updated = await this.prisma.store.update({
      where: { id },
      data: { bannerUrl },
      select: { id: true, bannerUrl: true },
    });
    await this.deleteCloudinaryImageIfPresent(store.bannerUrl).catch(() => undefined);
    return updated;
  }

  async uploadCccdFront(id: string, ownerId: string, file: Express.Multer.File) {
    const store = await this.checkOwnership(id, ownerId);
    const cccdFrontUrl = await this.cloudinary.uploadImage(file, `glowora/stores/${id}/cccd-front`);
    const updated = await this.prisma.store.update({
      where: { id },
      data: { cccdFrontUrl, ...this.reverificationData(store.status) },
      select: { id: true, cccdFrontUrl: true, status: true },
    });
    await this.deleteCloudinaryImageIfPresent(store.cccdFrontUrl).catch(() => undefined);
    return updated;
  }

  async uploadCccdBack(id: string, ownerId: string, file: Express.Multer.File) {
    const store = await this.checkOwnership(id, ownerId);
    const cccdBackUrl = await this.cloudinary.uploadImage(file, `glowora/stores/${id}/cccd-back`);
    const updated = await this.prisma.store.update({
      where: { id },
      data: { cccdBackUrl, ...this.reverificationData(store.status) },
      select: { id: true, cccdBackUrl: true, status: true },
    });
    await this.deleteCloudinaryImageIfPresent(store.cccdBackUrl).catch(() => undefined);
    return updated;
  }

  async uploadBusinessLicense(id: string, ownerId: string, file: Express.Multer.File) {
    const store = await this.checkOwnership(id, ownerId);
    const businessLicenseUrl = await this.cloudinary.uploadImage(file, `glowora/stores/${id}/business-license`);
    const updated = await this.prisma.store.update({
      where: { id },
      data: { businessLicenseUrl, ...this.reverificationData(store.status) },
      select: { id: true, businessLicenseUrl: true, status: true },
    });
    await this.deleteCloudinaryImageIfPresent(store.businessLicenseUrl).catch(() => undefined);
    return updated;
  }

  private async deleteCloudinaryImageIfPresent(url?: string | null) {
    if (!url?.includes(CLOUDINARY_IMAGE_HOST)) return;
    await this.cloudinary.deleteImage(this.cloudinary.extractPublicId(url));
  }

  async linkTelegramGroup(storeId: string, ownerId: string, telegramGroupId: string | null) {
    await this.checkOwnership(storeId, ownerId);
    return this.prisma.store.update({
      where: { id: storeId },
      data: { telegramGroupId },
      select: { id: true, name: true, telegramGroupId: true },
    });
  }

  async getPaymentConfig(storeId: string, ownerId: string) {
    await this.checkOwnership(storeId, ownerId);
    const config = await this.prisma.storePaymentConfig.findUnique({
      where: { storeId },
      select: {
        id: true,
        bankBin: true,
        bankAccountNo: true,
        bankAccountName: true,
        webhookSecret: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!config) return null;
    const appUrl = this.config.get<string>('APP_URL', 'https://your-domain.com');
    return {
      ...config,
      webhookUrl: `${appUrl}/payments/sepay/webhook/${storeId}`,
    };
  }

  async upsertPaymentConfig(storeId: string, ownerId: string, dto: UpsertPaymentConfigDto) {
    await this.checkOwnership(storeId, ownerId);
    const existing = await this.prisma.storePaymentConfig.findUnique({
      where: { storeId },
      select: { webhookSecret: true },
    });
    const webhookSecret = existing?.webhookSecret ?? crypto.randomBytes(32).toString('hex');
    const config = await this.prisma.storePaymentConfig.upsert({
      where: { storeId },
      create: {
        storeId,
        bankBin: dto.bankBin,
        bankAccountNo: dto.bankAccountNo,
        bankAccountName: dto.bankAccountName.toUpperCase(),
        webhookSecret,
        isActive: true,
      },
      update: {
        bankBin: dto.bankBin,
        bankAccountNo: dto.bankAccountNo,
        bankAccountName: dto.bankAccountName.toUpperCase(),
        webhookSecret,
        isActive: true,
      },
      select: {
        id: true,
        bankBin: true,
        bankAccountNo: true,
        bankAccountName: true,
        webhookSecret: true,
        isActive: true,
        updatedAt: true,
      },
    });
    const appUrl = this.config.get<string>('APP_URL', 'https://your-domain.com');
    return {
      ...config,
      webhookUrl: `${appUrl}/payments/sepay/webhook/${storeId}`,
    };
  }

  async deletePaymentConfig(storeId: string, ownerId: string) {
    await this.checkOwnership(storeId, ownerId);
    const existing = await this.prisma.storePaymentConfig.findUnique({ where: { storeId } });
    if (!existing) throw new NotFoundException('Chưa có cấu hình thanh toán để xóa');
    await this.prisma.$transaction([
      this.prisma.storePaymentConfig.delete({ where: { storeId } }),
      this.prisma.store.update({ where: { id: storeId }, data: { depositPercent: 0 } }),
    ]);
  }

  private reverificationData(currentStatus: StoreStatus): Prisma.StoreUncheckedUpdateInput {
    if (currentStatus !== StoreStatus.ACTIVE && currentStatus !== StoreStatus.INACTIVE) return {};
    return { status: StoreStatus.PENDING, approvedById: null, approvedAt: null, rejectionReason: null };
  }

  // So sánh với giá trị hiện tại trong DB — tránh việc submit lại y nguyên dữ liệu cũ
  // (form ở FE luôn gửi kèm toàn bộ field CCCD/biz dù người dùng không đổi gì) cũng kích hoạt duyệt lại.
  private hasVerificationChange(dto: UpdateStoreDto, store: Store): boolean {
    const textChanged = VERIFICATION_TEXT_FIELDS.some((field) => {
      const incoming = dto[field];
      return incoming !== undefined && incoming !== (store[field] ?? undefined);
    });
    if (textChanged) return true;

    return VERIFICATION_DATE_FIELDS.some((field) => {
      const incoming = dto[field];
      if (incoming === undefined) return false;
      const current = store[field];
      return new Date(incoming).getTime() !== (current ? current.getTime() : NaN);
    });
  }

  async checkOwnership(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Không tìm thấy cửa hàng');
    if (store.ownerId !== userId) {
      throw new ForbiddenException('Bạn không có quyền quản lý cửa hàng này');
    }
    if (store.status === StoreStatus.BANNED) {
      throw new ForbiddenException('Cửa hàng đang bị khóa');
    }
    return store;
  }

  private buildPublicWhere(filter: StoreFilterDto): Prisma.StoreWhereInput {
    return {
      status: StoreStatus.ACTIVE,
      ...(filter.provinceId && { provinceId: filter.provinceId }),
      ...(filter.wardId && { wardId: filter.wardId }),
      ...(filter.q && {
        OR: [
          { name: { contains: filter.q } },
          { address: { contains: filter.q } },
          { description: { contains: filter.q } },
        ],
      }),
      ...((filter.minRating || filter.maxRating) && {
        avgRating: {
          ...(filter.minRating && { gte: filter.minRating }),
          ...(filter.maxRating && { lte: filter.maxRating }),
        },
      }),
      ...(filter.categoryId && {
        services: {
          some: {
            status: 'ACTIVE',
            OR: [
              { category: { parentId: filter.categoryId } },
              { categoryId: filter.categoryId },
            ],
          },
        },
      }),
    };
  }

  private buildOrderBy(sort?: StoreFilterDto['sort']): Prisma.StoreOrderByWithRelationInput {
    if (sort === 'newest') return { createdAt: 'desc' };
    if (sort === 'name') return { name: 'asc' };
    return { avgRating: 'desc' };
  }

  private async generateUniqueSlug(name: string, provinceId?: number) {
    let provinceName = '';
    if (provinceId) {
      const province = await this.prisma.province.findUnique({ where: { id: provinceId } });
      if (province) provinceName = province.name;
    }
    const base = this.slugify(provinceName ? `${name} ${provinceName}` : name) || 'store';
    let slug = base;
    let suffix = 2;
    while (await this.prisma.store.findUnique({ where: { slug } })) {
      slug = `${base}-${suffix++}`;
    }
    return slug;
  }

  private mapStoreOwnerView<T extends { telegramGroupId: string | null }>(store: T): T & { telegramGroupLinked: boolean } {
    return { ...store, telegramGroupLinked: store.telegramGroupId !== null };
  }

  private slugify(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private assertValidWorkingHours(dto: UpdateWorkingHoursDto) {
    const seen = new Set<DayOfWeek>();
    for (const hour of dto.hours) {
      if (seen.has(hour.dayOfWeek)) {
        throw new BadRequestException(`Giờ làm việc bị trùng lặp cho ngày ${hour.dayOfWeek}`);
      }
      seen.add(hour.dayOfWeek);
      if (!hour.isClosed && this.toMinutes(hour.openTime) >= this.toMinutes(hour.closeTime)) {
        throw new BadRequestException('Giờ mở cửa phải trước giờ đóng cửa');
      }
    }
  }

  private toMinutes(value: string) {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }
}
