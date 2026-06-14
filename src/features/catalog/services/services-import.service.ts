import { BadRequestException, Injectable } from '@nestjs/common';
import { ServiceStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../prisma/prisma.service';

interface ParsedRow {
  rowNumber: number;
  serviceName: string;
  categoryName?: string;
  description?: string;
  variantName: string;
  duration: number;
  price: number;
  status: ServiceStatus;
}

interface ImportError {
  row: number;
  message: string;
}

export interface ImportResult {
  totalRows: number;
  successCount: number;
  skippedCount: number;
  errors: ImportError[];
  created: Array<{ serviceName: string; variantCount: number }>;
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function getCellString(cell: ExcelJS.Cell): string {
  const val = cell.value;
  if (val == null) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return String(val);
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object') {
    if ('richText' in val) {
      return (val as ExcelJS.CellRichTextValue).richText.map(r => r.text).join('').trim();
    }
    if ('text' in val) {
      const text = (val as { text: string | ExcelJS.CellRichTextValue }).text;
      if (typeof text === 'string') return text.trim();
      if (typeof text === 'object' && 'richText' in text) {
        return text.richText.map(r => r.text).join('').trim();
      }
    }
    if ('result' in val) {
      const result = (val as ExcelJS.CellFormulaValue).result;
      if (result == null) return '';
      if (typeof result === 'number') return String(result);
      if (typeof result === 'string') return result.trim();
    }
  }
  return '';
}

function getCellNumber(cell: ExcelJS.Cell): number | null {
  const val = cell.value;
  if (typeof val === 'number') return val;
  const str = getCellString(cell);
  if (!str) return null;
  const num = parseFloat(str.replace(/[^\d.-]/g, ''));
  return isNaN(num) ? null : num;
}

const ALLOWED_MIMETYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

@Injectable()
export class ServicesImportService {
  constructor(private readonly prisma: PrismaService) {}

  private validateFile(file: Express.Multer.File) {
    if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
      throw new BadRequestException('Chỉ hỗ trợ file Excel (.xlsx, .xls)');
    }
  }

  private async parseExcel(
    buffer: Buffer<ArrayBufferLike>,
  ): Promise<{ validRows: ParsedRow[]; rowErrors: ImportError[]; totalRows: number }> {
    const workbook = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);

    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('File Excel không có sheet nào');

    const validRows: ParsedRow[] = [];
    const rowErrors: ImportError[] = [];
    let totalRows = 0;

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 3) return; // bỏ 2 dòng tiêu đề/hướng dẫn + 1 dòng header cột

      // Bỏ qua dòng trống hoàn toàn
      const rawCells = [1, 2, 3, 4, 5, 6, 7].map(c => getCellString(row.getCell(c)));
      if (rawCells.every(c => !c)) return;

      totalRows++;

      const serviceName = getCellString(row.getCell(1));
      const categoryName = getCellString(row.getCell(2)) || undefined;
      const description = getCellString(row.getCell(3)) || undefined;
      const variantName = getCellString(row.getCell(4)) || 'Gói cơ bản';
      const durationRaw = getCellNumber(row.getCell(5));
      const priceRaw = getCellNumber(row.getCell(6));
      const statusRaw = getCellString(row.getCell(7)).toUpperCase();

      if (!serviceName) {
        rowErrors.push({ row: rowNumber, message: 'Thiếu Tên Dịch Vụ' });
        return;
      }
      if (serviceName.length > 150) {
        rowErrors.push({ row: rowNumber, message: `Tên Dịch Vụ vượt quá 150 ký tự` });
        return;
      }
      if (durationRaw == null || !Number.isInteger(durationRaw) || durationRaw <= 0) {
        rowErrors.push({ row: rowNumber, message: 'Thời Lượng phải là số nguyên dương' });
        return;
      }
      if (priceRaw == null || priceRaw < 0) {
        rowErrors.push({ row: rowNumber, message: 'Giá Bán không hợp lệ (phải >= 0)' });
        return;
      }

      const status = statusRaw === 'INACTIVE' ? ServiceStatus.INACTIVE : ServiceStatus.ACTIVE;

      validRows.push({
        rowNumber,
        serviceName,
        categoryName,
        description,
        variantName,
        duration: durationRaw,
        price: priceRaw,
        status,
      });
    });

    return { validRows, rowErrors, totalRows };
  }

  async importServices(storeId: string, file: Express.Multer.File): Promise<ImportResult> {
    this.validateFile(file);

    const { validRows, rowErrors, totalRows } = await this.parseExcel(file.buffer);

    // Gom nhóm theo tên dịch vụ
    const serviceGroups = new Map<string, ParsedRow[]>();
    for (const row of validRows) {
      if (!serviceGroups.has(row.serviceName)) serviceGroups.set(row.serviceName, []);
      serviceGroups.get(row.serviceName)!.push(row);
    }

    const businessErrors: ImportError[] = [];
    const serviceNames = [...serviceGroups.keys()];

    // Kiểm tra tên đã tồn tại trong store
    const existingServices = await this.prisma.service.findMany({
      where: { storeId, name: { in: serviceNames } },
      select: { name: true },
    });
    const existingNames = new Set(existingServices.map(s => s.name));

    let duplicateRowCount = 0;
    const toCreate: string[] = [];

    for (const name of serviceNames) {
      if (existingNames.has(name)) {
        const rows = serviceGroups.get(name)!;
        duplicateRowCount += rows.length;
        businessErrors.push({
          row: rows[0].rowNumber,
          message: `Dịch vụ "${name}" đã tồn tại trong cửa hàng, bỏ qua`,
        });
      } else {
        toCreate.push(name);
      }
    }

    const created: Array<{ serviceName: string; variantCount: number }> = [];

    if (toCreate.length > 0) {
      // Batch lookup danh mục theo tên
      const categoryNames = [
        ...new Set(
          toCreate.flatMap(name =>
            serviceGroups.get(name)!.map(r => r.categoryName).filter((n): n is string => !!n),
          ),
        ),
      ];

      const categoryMap = new Map<string, string>(); // name -> id
      if (categoryNames.length > 0) {
        const categories = await this.prisma.serviceCategory.findMany({
          where: {
            name: { in: categoryNames },
            OR: [{ storeId }, { storeId: null }],
          },
          select: { id: true, name: true, storeId: true },
        });
        // Ưu tiên danh mục của store, fallback về danh mục hệ thống
        for (const cat of categories) {
          if (!categoryMap.has(cat.name) || cat.storeId === storeId) {
            categoryMap.set(cat.name, cat.id);
          }
        }
      }

      // Pre-generate slug duy nhất
      const existingSlugs = new Set(
        (await this.prisma.service.findMany({ where: { storeId }, select: { slug: true } }))
          .map(s => s.slug)
          .filter((s): s is string => s != null),
      );
      const usedSlugs = new Set<string>();

      const makeSlug = (name: string): string => {
        const base = slugify(name) || 'service';
        let slug = base;
        let suffix = 2;
        while (existingSlugs.has(slug) || usedSlugs.has(slug)) {
          slug = `${base}-${suffix++}`;
        }
        usedSlugs.add(slug);
        return slug;
      };

      await this.prisma.$transaction(async tx => {
        for (const name of toCreate) {
          const rows = serviceGroups.get(name)!;
          const firstRow = rows[0];
          const slug = makeSlug(name);
          const categoryId = firstRow.categoryName ? (categoryMap.get(firstRow.categoryName) ?? null) : null;

          await tx.service.create({
            data: {
              storeId,
              name,
              slug,
              description: firstRow.description,
              categoryId,
              variants: {
                create: rows.map((row, i) => ({
                  name: row.variantName,
                  duration: row.duration,
                  price: row.price,
                  sortOrder: i,
                  status: row.status,
                })),
              },
            },
          });

          created.push({ serviceName: name, variantCount: rows.length });
        }
      });
    }

    const allErrors = [...rowErrors, ...businessErrors];
    const successCount = created.reduce((sum, c) => sum + c.variantCount, 0);
    const skippedCount = rowErrors.length + duplicateRowCount;

    return { totalRows, successCount, skippedCount, errors: allErrors, created };
  }
}
