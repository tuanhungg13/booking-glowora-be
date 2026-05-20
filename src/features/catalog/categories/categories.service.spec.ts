import { NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

describe('CategoriesService — Phase 3 Catalog', () => {
  let service: CategoriesService;
  let prisma: any;

  const baseCategory = {
    id: 'cat-1',
    name: 'Chăm sóc da',
    slug: 'cham-soc-da',
    description: 'Dịch vụ chăm sóc da chuyên sâu',
    iconUrl: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    prisma = {
      serviceCategory: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new CategoriesService(prisma);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ───────────────────────────────────────────────────────────────

  it('creates category and auto-generates slug from name', async () => {
    prisma.serviceCategory.create.mockResolvedValue(baseCategory);

    const result = await service.create({ name: 'Chăm sóc da', description: 'Mô tả' });

    expect(prisma.serviceCategory.create).toHaveBeenCalledWith({
      data: {
        name: 'Chăm sóc da',
        slug: 'cham-soc-da',
        description: 'Mô tả',
        iconUrl: undefined,
      },
    });
    expect(result.name).toBe('Chăm sóc da');
  });

  it('creates category without optional fields', async () => {
    prisma.serviceCategory.create.mockResolvedValue({ ...baseCategory, description: null });

    await service.create({ name: 'Massage' });

    expect(prisma.serviceCategory.create).toHaveBeenCalledWith({
      data: {
        name: 'Massage',
        slug: 'massage',
        description: undefined,
        iconUrl: undefined,
      },
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  it('findAll returns all categories ordered by name', async () => {
    const categories = [baseCategory, { ...baseCategory, id: 'cat-2', name: 'Nail' }];
    prisma.serviceCategory.findMany.mockResolvedValue(categories);

    const result = await service.findAll();

    expect(prisma.serviceCategory.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
      include: { _count: { select: { services: true, combos: true } } },
    });
    expect(result).toHaveLength(2);
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  it('findOne returns category with services and combos', async () => {
    prisma.serviceCategory.findUnique.mockResolvedValue({
      ...baseCategory,
      services: [],
      combos: [],
    });

    const result = await service.findOne('cat-1');

    expect(prisma.serviceCategory.findUnique).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      include: { services: true, combos: true },
    });
    expect(result.id).toBe('cat-1');
  });

  it('findOne throws NotFoundException for missing category', async () => {
    prisma.serviceCategory.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── update ───────────────────────────────────────────────────────────────

  it('update changes name and re-generates slug', async () => {
    prisma.serviceCategory.findUnique.mockResolvedValue({ ...baseCategory, services: [], combos: [] });
    prisma.serviceCategory.update.mockResolvedValue({ ...baseCategory, name: 'Massage Thư Giãn', slug: 'massage-thu-gian' });

    const result = await service.update('cat-1', { name: 'Massage Thư Giãn' });

    expect(prisma.serviceCategory.update).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      data: {
        name: 'Massage Thư Giãn',
        slug: 'massage-thu-gian',
        description: undefined,
        iconUrl: undefined,
      },
    });
    expect(result.slug).toBe('massage-thu-gian');
  });

  it('update keeps existing slug when name is not provided', async () => {
    prisma.serviceCategory.findUnique.mockResolvedValue({ ...baseCategory, services: [], combos: [] });
    prisma.serviceCategory.update.mockResolvedValue({ ...baseCategory, description: 'Updated desc' });

    await service.update('cat-1', { description: 'Updated desc' });

    expect(prisma.serviceCategory.update).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      data: {
        name: undefined,
        slug: undefined,
        description: 'Updated desc',
        iconUrl: undefined,
      },
    });
  });

  it('update throws NotFoundException for missing category', async () => {
    prisma.serviceCategory.findUnique.mockResolvedValue(null);

    await expect(service.update('missing', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.serviceCategory.update).not.toHaveBeenCalled();
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  it('remove hard-deletes category by id', async () => {
    prisma.serviceCategory.findUnique.mockResolvedValue({ ...baseCategory, services: [], combos: [] });
    prisma.serviceCategory.delete.mockResolvedValue(baseCategory);

    const result = await service.remove('cat-1');

    expect(prisma.serviceCategory.delete).toHaveBeenCalledWith({ where: { id: 'cat-1' } });
    expect(result).toEqual({ deleted: true });
  });

  it('remove throws NotFoundException for missing category', async () => {
    prisma.serviceCategory.findUnique.mockResolvedValue(null);

    await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.serviceCategory.delete).not.toHaveBeenCalled();
  });
});
