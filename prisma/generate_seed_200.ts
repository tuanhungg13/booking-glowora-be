import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_SQL = path.join(__dirname, 'seed_200_stores.sql');
const OUTPUT_ACCOUNTS = path.join(__dirname, 'seed_200_accounts.md');
const PASSWORD_HASH = '$2b$10$4rNY01kLNBZFcBWQuq.Rsu5P9g490SvP0fZ6PoftwySYtMQTKw/Dq';
const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;

type DayOfWeek = (typeof DAYS)[number];
type StoreKindKey =
  | 'spa'
  | 'nail'
  | 'hair'
  | 'barber'
  | 'skin'
  | 'yoga'
  | 'aesthetic'
  | 'lash'
  | 'pmu'
  | 'body';

type StoreKind = {
  key: StoreKindKey;
  label: string;
  count: number;
  suffixes: string[];
  categorySlugs: string[];
  staffSpecialties: string[];
  imageUrl: string;
};

type CityPlan = {
  provinceId: number;
  label: string;
  count: number;
  wards: number[];
  lat: [number, number];
  lng: [number, number];
  districts: string[];
};

type ShopCategoryTemplate = {
  key: string;
  name: string;
  parentSlug: string;
  description: string;
};

type ServiceTemplate = {
  name: string;
  baseSlug: string;
  categoryKey: string;
  focus: string;
  imageUrl: string;
  price: [number, number, number];
  duration: [number, number, number];
};

type StoreSeed = {
  index: number;
  code: string;
  kind: StoreKind;
  city: CityPlan;
  name: string;
  slug: string;
  ownerEmail: string;
  staffEmails: string[];
  serviceSlugs: string[];
};

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randInt(min: number, max: number, rand: () => number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

function pick<T>(items: T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length)];
}

function viText(value: string): string {
  const replacements: Array<[string, string]> = [
    ['Ho Chi Minh', 'Hồ Chí Minh'],
    ['Ha Noi', 'Hà Nội'],
    ['Da Nang', 'Đà Nẵng'],
    ['Can Tho', 'Cần Thơ'],
    ['Hue', 'Huế'],
    ['Khanh Hoa', 'Khánh Hòa'],
    ['Dong Nai', 'Đồng Nai'],
    ['Hai Phong', 'Hải Phòng'],
    ['Quang Ninh', 'Quảng Ninh'],
    ['Lam Dong', 'Lâm Đồng'],
    ['Bac Ninh', 'Bắc Ninh'],
    ['An Nhien', 'An Nhiên'],
    ['Moc An', 'Mộc An'],
    ['Rose', 'Rosé'],
    ['Toc & Lam Dep', 'Tóc & Làm Đẹp'],
    ['Tham My Vien', 'Thẩm Mỹ Viện'],
    ['Tam Trang & Spa', 'Tắm Trắng & Spa'],
    ['Chu cua hang', 'Chủ cửa hàng'],
    ['Nhan vien', 'Nhân viên'],
    ['cua hang', 'cửa hàng'],
    ['thuoc nhom', 'thuộc nhóm'],
    ['du lieu duoc tao de test tim kiem, dat lich, nhan vien va dich vu', 'dữ liệu được tạo để test tìm kiếm, đặt lịch, nhân viên và dịch vụ'],
    ['Quan ', 'Quận '],
    ['Binh Thanh', 'Bình Thạnh'],
    ['Phu Nhuan', 'Phú Nhuận'],
    ['Tan Binh', 'Tân Bình'],
    ['Thu Duc', 'Thủ Đức'],
    ['Hoan Kiem', 'Hoàn Kiếm'],
    ['Ba Dinh', 'Ba Đình'],
    ['Dong Da', 'Đống Đa'],
    ['Cau Giay', 'Cầu Giấy'],
    ['Tay Ho', 'Tây Hồ'],
    ['Ha Dong', 'Hà Đông'],
    ['Hai Chau', 'Hải Châu'],
    ['Thanh Khe', 'Thanh Khê'],
    ['Son Tra', 'Sơn Trà'],
    ['Ngu Hanh Son', 'Ngũ Hành Sơn'],
    ['Lien Chieu', 'Liên Chiểu'],
    ['Ninh Kieu', 'Ninh Kiều'],
    ['Binh Thuy', 'Bình Thủy'],
    ['Cai Rang', 'Cái Răng'],
    ['O Mon', 'Ô Môn'],
    ['Thuan Hoa', 'Thuận Hóa'],
    ['Phu Xuan', 'Phú Xuân'],
    ['Huong Thuy', 'Hương Thủy'],
    ['Nha Trang', 'Nha Trang'],
    ['Cam Ranh', 'Cam Ranh'],
    ['Dien Khanh', 'Diên Khánh'],
    ['Bien Hoa', 'Biên Hòa'],
    ['Long Khanh', 'Long Khánh'],
    ['Trang Bom', 'Trảng Bom'],
    ['Hong Bang', 'Hồng Bàng'],
    ['Ngo Quyen', 'Ngô Quyền'],
    ['Le Chan', 'Lê Chân'],
    ['Ha Long', 'Hạ Long'],
    ['Cam Pha', 'Cẩm Phả'],
    ['Uong Bi', 'Uông Bí'],
    ['Da Lat', 'Đà Lạt'],
    ['Bao Loc', 'Bảo Lộc'],
    ['Duc Trong', 'Đức Trọng'],
    ['Tu Son', 'Từ Sơn'],
    ['Que Vo', 'Quế Võ'],
    ['Nguyen Hue', 'Nguyễn Huệ'],
    ['Le Loi', 'Lê Lợi'],
    ['Tran Hung Dao', 'Trần Hưng Đạo'],
    ['Hai Ba Trung', 'Hai Bà Trưng'],
    ['Phan Chu Trinh', 'Phan Chu Trinh'],
    ['Ly Thuong Kiet', 'Lý Thường Kiệt'],
    ['Spa nghi duong', 'Spa nghỉ dưỡng'],
    ['Hair salon nu', 'Hair salon nữ'],
    ['Tham my vien', 'Thẩm mỹ viện'],
    ['Phun xam PMU', 'Phun xăm PMU'],
    ['Body care & tam trang', 'Body care & tắm trắng'],
    ['Massage tri lieu', 'Massage trị liệu'],
    ['Cham soc body', 'Chăm sóc body'],
    ['Facial thu gian', 'Facial thư giãn'],
    ['Xong hoi thao moc', 'Xông hơi thảo mộc'],
    ['Gel nail', 'Gel nail'],
    ['Nail art', 'Nail art'],
    ['Cat tao kieu', 'Cắt tạo kiểu'],
    ['Nhuom mau', 'Nhuộm màu'],
    ['Uon duoi', 'Uốn duỗi'],
    ['Phuc hoi toc', 'Phục hồi tóc'],
    ['Cat toc nam', 'Cắt tóc nam'],
    ['Cao rau', 'Cạo râu'],
    ['Goi dau thao moc', 'Gội đầu thảo mộc'],
    ['Facial chuyen sau', 'Facial chuyên sâu'],
    ['Tri mun', 'Trị mụn'],
    ['Peel da', 'Peel da'],
    ['Tham nam', 'thâm nám'],
    ['Nang co', 'Nâng cơ'],
    ['tre hoa', 'trẻ hóa'],
    ['Giam beo', 'Giảm béo'],
    ['Noi mi', 'Nối mi'],
    ['Tao dang long may', 'Tạo dáng lông mày'],
    ['Phun moi', 'Phun môi'],
    ['Tam trang', 'Tắm trắng'],
    ['U body', 'Ủ body'],
    ['Noi Mi', 'Nối Mi'],
    ['Cham Soc', 'Chăm Sóc'],
    ['Duong Sinh', 'Dưỡng Sinh'],
    ['Massage tri lieu', 'Massage trị liệu'],
    ['Cham soc da mat', 'Chăm sóc da mặt'],
    ['Cham soc', 'Chăm sóc'],
    ['Lam sach', 'Làm sạch'],
    ['cap am', 'cấp ẩm'],
    ['da dau', 'da đầu'],
    ['co vai gay', 'cổ vai gáy'],
    ['dieu tri', 'điều trị'],
    ['phuc hoi', 'phục hồi'],
    ['giam', 'giảm'],
    ['thu gian', 'thư giãn'],
    ['tu nhien', 'tự nhiên'],
    ['an toan', 'an toàn'],
    ['toan than', 'toàn thân'],
    ['thao duoc', 'thảo dược'],
    ['nghe thuat', 'nghệ thuật'],
    ['dinh hinh', 'định hình'],
    ['cong nghe', 'công nghệ'],
    ['khuon mat', 'khuôn mặt'],
    ['chan may', 'chân mày'],
    ['mat na', 'mặt nạ'],
    ['co the', 'cơ thể'],
    ['mau', 'màu'],
    ['moi', 'môi'],
    ['mong', 'móng'],
    ['toc', 'tóc'],
    ['long', 'lông'],
    ['triet', 'triệt'],
    ['duong', 'dưỡng'],
    ['dau', 'đầu'],
    [' va ', ' và '],
    ['Tam trang va xong hoi', 'Tắm trắng và xông hơi'],
    ['Cham soc co the', 'Chăm sóc cơ thể'],
    ['Goi dau duong sinh', 'Gội đầu dưỡng sinh'],
    ['Nail gel va son mong', 'Nail gel và sơn móng'],
    ['Nail art va dap bot', 'Nail art và đắp bột'],
    ['Pedicure va foot care', 'Pedicure và foot care'],
    ['Waxing diu nhe', 'Waxing dịu nhẹ'],
    ['Mi va chan may', 'Mi và chân mày'],
    ['Cat va tao kieu', 'Cắt và tạo kiểu'],
    ['Nhuom va highlight', 'Nhuộm và highlight'],
    ['Uon duoi ep toc', 'Uốn duỗi ép tóc'],
    ['Makeup va styling', 'Makeup và styling'],
    ['Cat toc nam', 'Cắt tóc nam'],
    ['Cao rau va cham soc beard', 'Cạo râu và chăm sóc beard'],
    ['Goi dau nam', 'Gội đầu nam'],
    ['Combo grooming', 'Combo grooming'],
    ['Massage thu gian', 'Massage thư giãn'],
    ['Facial va cap am', 'Facial và cấp ẩm'],
    ['Dieu tri mun va tham', 'Điều trị mụn và thâm'],
    ['Peel da hoa hoc', 'Peel da hóa học'],
    ['Laser va tre hoa', 'Laser và trẻ hóa'],
    ['Triet long laser', 'Triệt lông laser'],
    ['Yoga co ban va nang cao', 'Yoga cơ bản và nâng cao'],
    ['Pilates va core', 'Pilates và core'],
    ['Thien va breathwork', 'Thiền và breathwork'],
    ['Personal training', 'Personal training'],
    ['Yoga tri lieu', 'Yoga trị liệu'],
    ['Nang co va cang da', 'Nâng cơ và căng da'],
    ['Dieu khac khuon mat', 'Điêu khắc khuôn mặt'],
    ['Tre hoa cong nghe cao', 'Trẻ hóa công nghệ cao'],
    ['Giam beo va dinh hinh', 'Giảm béo và định hình'],
    ['Dieu tri tham nam', 'Điều trị thâm nám'],
    ['Noi mi classic va volume', 'Nối mi classic và volume'],
    ['Lift mi va uon mi', 'Lift mi và uốn mi'],
    ['Tao dang long may', 'Tạo dáng lông mày'],
    ['Cham soc mi tu nhien', 'Chăm sóc mi tự nhiên'],
    ['Combo mat', 'Combo mắt'],
    ['Phun moi tham my', 'Phun môi thẩm mỹ'],
    ['Phun va dieu khac chan may', 'Phun và điêu khắc chân mày'],
    ['Phun mi mat', 'Phun mí mắt'],
    ['Cham soc sau phun', 'Chăm sóc sau phun'],
    ['Combo phun xam', 'Combo phun xăm'],
    ['Tam trang toan than', 'Tắm trắng toàn thân'],
    ['Body scrub', 'Body scrub'],
    ['U body va mat na co the', 'Ủ body và mặt nạ cơ thể'],
    ['Xong hoi va ngam tam', 'Xông hơi và ngâm tắm'],
    ['Massage da nong', 'Massage đá nóng'],
    ['Massage body tinh dau', 'Massage body tinh dầu'],
    ['Massage co vai gay', 'Massage cổ vai gáy'],
    ['Facial cap am phuc hoi', 'Facial cấp ẩm phục hồi'],
    ['Tam trang thao moc', 'Tắm trắng thảo mộc'],
    ['Xong hoi detox', 'Xông hơi detox'],
    ['Body scrub muoi khoang', 'Body scrub muối khoáng'],
    ['Son gel Han Quoc', 'Sơn gel Hàn Quốc'],
    ['Dap gel builder', 'Đắp gel builder'],
    ['Pedicure spa', 'Pedicure spa'],
    ['Waxing vung nho', 'Waxing vùng nhỏ'],
    ['Noi mi tu nhien', 'Nối mi tự nhiên'],
    ['Cat tao kieu nu', 'Cắt tạo kiểu nữ'],
    ['Nhuom phu bac', 'Nhuộm phủ bạc'],
    ['Balayage thoi trang', 'Balayage thời trang'],
    ['Uon setting', 'Uốn setting'],
    ['Duoi collagen', 'Duỗi collagen'],
    ['Phuc hoi keratin', 'Phục hồi keratin'],
    ['Makeup du tiec', 'Makeup dự tiệc'],
    ['Cao rau nong', 'Cạo râu nóng'],
    ['Goi dau thao moc nam', 'Gội đầu thảo mộc nam'],
    ['Facial lam sach sau', 'Facial làm sạch sâu'],
    ['Tri mun chuyen sau', 'Trị mụn chuyên sâu'],
    ['Giam tham sau mun', 'Giảm thâm sau mụn'],
    ['Laser tri nam', 'Laser trị nám'],
    ['Triet long toan than', 'Triệt lông toàn thân'],
    ['Phun moi lip blush', 'Phun môi lip blush'],
    ['Phun moi khu tham', 'Phun môi khử thâm'],
    ['Microblading chan may', 'Microblading chân mày'],
    ['Phun mi eyeliner', 'Phun mí eyeliner'],
    ['Tai kham bo sung mau', 'Tái khám bổ sung màu'],
    ['Tam trang sua de', 'Tắm trắng sữa dê'],
    ['Tam trang carbon', 'Tắm trắng carbon'],
    ['Body scrub ca phe', 'Body scrub cà phê'],
    ['U body collagen', 'Ủ body collagen'],
    ['Xong hoi onsen', 'Xông hơi onsen'],
    ['Massage body co ban', 'Massage body cơ bản'],
    ['Co ban', 'Cơ bản'],
    ['Nang cao', 'Nâng cao'],
    ['phut', 'phút'],
    ['thoi luong', 'thời lượng'],
    ['lieu trinh', 'liệu trình'],
    ['thuc hien', 'thực hiện'],
    ['phu hop', 'phù hợp'],
    ['khach hang', 'khách hàng'],
    ['can trai nghiem on dinh', 'cần trải nghiệm ổn định'],
    ['co the dat lich lap lai', 'có thể đặt lịch lặp lại'],
    ['Tu van nhanh truoc khi bat dau', 'Tư vấn nhanh trước khi bắt đầu'],
    ['Thuc hien theo quy trinh ve sinh va thao tac chuan', 'Thực hiện theo quy trình vệ sinh và thao tác chuẩn'],
    ['Su dung san pham diu nhe, phu hop da so nhu cau', 'Sử dụng sản phẩm dịu nhẹ, phù hợp đa số nhu cầu'],
    ['Huong dan cham soc sau dich vu', 'Hướng dẫn chăm sóc sau dịch vụ'],
    ['phu trach', 'phụ trách'],
    [' la ', ' là '],
    [' cua ', ' của '],
    ['tam trang', 'tắm trắng'],
    ['massage tri lieu', 'massage trị liệu'],
    ['cham soc', 'chăm sóc'],
    ['xong hoi', 'xông hơi'],
    ['thao moc', 'thảo mộc'],
    ['cat tao kieu', 'cắt tạo kiểu'],
    ['nhuom mau', 'nhuộm màu'],
    ['uon duoi', 'uốn duỗi'],
    ['phuc hoi toc', 'phục hồi tóc'],
    ['cat toc nam', 'cắt tóc nam'],
    ['cao rau', 'cạo râu'],
    ['facial chuyen sau', 'facial chuyên sâu'],
    ['tri mun', 'trị mụn'],
    ['peel da', 'peel da'],
    ['nang co', 'nâng cơ'],
    ['laser tham nam', 'laser thâm nám'],
    ['giam beo', 'giảm béo'],
    ['noi mi', 'nối mi'],
    ['tao dang long may', 'tạo dáng lông mày'],
    ['phun moi', 'phun môi'],
    ['microblading', 'microblading'],
    ['powder brow', 'powder brow'],
    ['phun mi', 'phun mí'],
    ['body scrub', 'body scrub'],
    ['u body', 'ủ body'],
    ['Xong hoi', 'Xông hơi'],
    ['Nhuom', 'Nhuộm'],
    ['thoi trang', 'thời trang'],
    ['phu bac', 'phủ bạc'],
    ['kho', 'khô'],
    ['uot', 'ướt'],
  ];

  let out = value;
  for (const [from, to] of [...replacements].sort((a, b) => b[0].length - a[0].length)) {
    out = out.split(from).join(to);
  }
  return out;
}

function shouldTranslate(value: string): boolean {
  if (value.includes('@')) return false;
  if (value.startsWith('http://') || value.startsWith('https://')) return false;
  if (value.startsWith('$2')) return false;
  if (/^[a-z0-9-]+$/.test(value)) return false;
  if (/^[A-Z_]+$/.test(value)) return false;
  if (/^[A-Za-z_/-]+$/.test(value)) return false;
  return true;
}

function sql(value: string | number | boolean | null): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (shouldTranslate(value)) value = viText(value);
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function money(value: number): string {
  return `${value.toFixed(2)}`;
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function batchInsert(
  lines: string[],
  table: string,
  columns: string[],
  options: { batchSize?: number; suffix?: string } = {},
): string[] {
  const out: string[] = [];
  const batchSize = options.batchSize ?? 250;
  for (let i = 0; i < lines.length; i += batchSize) {
    const batch = lines.slice(i, i + batchSize);
    out.push(`INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(', ')}) VALUES`);
    out.push(batch.map((line, idx) => `${line}${idx === batch.length - 1 ? '' : ','}`).join('\n'));
    out.push(options.suffix ?? ';');
    out.push('');
  }
  return out;
}

const BRANDS = [
  'Glowora',
  'An Nhien',
  'Lumina',
  'Moc An',
  'Serene',
  'Aurora',
  'La Vie',
  'Herbal',
  'Bloom',
  'Sakura',
  'Jade',
  'Aura',
  'Lotus',
  'Pearl',
  'Eden',
  'Velvet',
  'Zenith',
  'Ivory',
  'Rose',
  'Amber',
];

const FIRST_NAMES = [
  'Hùng',
  'Huy',
  'Ngọc',
  'Nhi',
  'Hồng Hạnh',
  'Tuấn Tú',
  'Minh Anh',
  'Gia Hân',
  'Quỳnh Như',
  'Bảo Ngọc',
  'Thanh Trúc',
  'Hoàng Anh',
  'Khánh Linh',
  'Phương Thảo',
  'Mai Chi',
  'Tú Anh',
  'Thùy Dương',
  'Ngọc Lan',
  'Hải Yến',
  'Thu Hà',
  'Bích Ngọc',
  'Kim Ngân',
  'Nhật Minh',
  'Đức Anh',
  'Quang Huy',
  'Minh Khang',
  'Anh Tuấn',
  'Hoàng Nam',
  'Gia Bảo',
  'Tuấn Kiệt',
  'Khánh Vy',
  'Mỹ Linh',
  'Hà My',
  'Diễm My',
  'Lan Anh',
  'Ngọc Ánh',
  'Thu Trang',
  'Yến Nhi',
  'Hoài An',
  'Minh Châu',
  'Thanh Hằng',
  'Hồng Ngọc',
  'Phúc An',
  'Bảo Trâm',
  'Thảo Vy',
  'Gia Linh',
  'Đan Thanh',
  'Trúc Linh',
  'Tường Vy',
  'Ánh Dương',
  'Đức Huy',
  'Thanh Tùng',
  'Quốc Huy',
  'Tuấn Anh',
  'Minh Quân',
  'Hoàng Phúc',
  'Đăng Khoa',
  'Bảo Long',
  'Gia Khánh',
  'Quang Minh',
];

const STORE_KINDS: StoreKind[] = [
  {
    key: 'spa',
    label: 'Spa nghi duong',
    count: 30,
    suffixes: ['Spa', 'Wellness Spa', 'Day Spa', 'Luxury Spa'],
    categorySlugs: ['spa-massage', 'cham-soc-da-mat', 'xong-hoi-tam-trang', 'cham-soc-co-the'],
    staffSpecialties: ['Massage tri lieu', 'Cham soc body', 'Facial thu gian', 'Xong hoi thao moc'],
    imageUrl: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'nail',
    label: 'Nail & beauty salon',
    count: 25,
    suffixes: ['Nail Studio', 'Beauty Bar', 'Nail & Spa', 'Nail Lounge'],
    categorySlugs: ['nail-mong-tay', 'long-may-mi-mat', 'triet-long'],
    staffSpecialties: ['Gel nail', 'Nail art', 'Pedicure', 'Waxing'],
    imageUrl: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'hair',
    label: 'Hair salon nu',
    count: 25,
    suffixes: ['Hair Salon', 'Hair Studio', 'Beauty Salon', 'Toc & Lam Dep'],
    categorySlugs: ['toc-nu', 'cham-soc-da-mat', 'trang-diem'],
    staffSpecialties: ['Cat tao kieu', 'Nhuom mau', 'Uon duoi', 'Phuc hoi toc'],
    imageUrl: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'barber',
    label: 'Barber store',
    count: 20,
    suffixes: ['Barbershop', "Men's Grooming", 'Classic Barber', 'Barber & Spa'],
    categorySlugs: ['cat-toc-barber', 'spa-massage'],
    staffSpecialties: ['Cat toc nam', 'Cao rau', 'Fade & pompadour', 'Goi dau thao moc'],
    imageUrl: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'skin',
    label: 'Skincare clinic',
    count: 25,
    suffixes: ['Skin Clinic', 'Beauty Clinic', 'Skincare Studio', 'Derma Spa'],
    categorySlugs: ['cham-soc-da-mat', 'tham-my-vien', 'triet-long'],
    staffSpecialties: ['Facial chuyen sau', 'Tri mun', 'Peel da', 'Laser toning'],
    imageUrl: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'yoga',
    label: 'Yoga & wellness studio',
    count: 15,
    suffixes: ['Yoga Studio', 'Wellness Center', 'Yoga & Pilates', 'Mind & Body'],
    categorySlugs: ['yoga-thien', 'fitness-pt', 'cham-soc-suc-khoe'],
    staffSpecialties: ['Hatha yoga', 'Pilates', 'Breathwork', 'PT ca nhan'],
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'aesthetic',
    label: 'Tham my vien',
    count: 20,
    suffixes: ['Beauty Center', 'Aesthetic Clinic', 'Beauty Lab', 'Tham My Vien'],
    categorySlugs: ['tham-my-vien', 'triet-long', 'cham-soc-co-the', 'cham-soc-da-mat'],
    staffSpecialties: ['HIFU nang co', 'RF tre hoa', 'Laser tham nam', 'Giam beo cong nghe'],
    imageUrl: 'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'lash',
    label: 'Eyelash & brow studio',
    count: 15,
    suffixes: ['Lash Studio', 'Brow & Lash', 'Eye Beauty', 'Lash Lounge'],
    categorySlugs: ['long-may-mi-mat', 'trang-diem'],
    staffSpecialties: ['Noi mi classic', 'Volume lash', 'Lift mi', 'Tao dang long may'],
    imageUrl: 'https://images.unsplash.com/photo-1589710751893-f9a6770ad71b?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'pmu',
    label: 'Phun xam PMU',
    count: 15,
    suffixes: ['PMU Studio', 'Phun Xam Studio', 'Xam Tham My', 'Beauty Art'],
    categorySlugs: ['phun-xam-tham-my', 'long-may-mi-mat'],
    staffSpecialties: ['Phun moi', 'Microblading', 'Powder brow', 'Phun mi'],
    imageUrl: 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'body',
    label: 'Body care & tam trang',
    count: 10,
    suffixes: ['Body Studio', 'Tam Trang & Spa', 'Body Lounge', 'Care House'],
    categorySlugs: ['xong-hoi-tam-trang', 'cham-soc-co-the', 'spa-massage'],
    staffSpecialties: ['Tam trang', 'Body scrub', 'U body', 'Massage thu gian'],
    imageUrl: 'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=1200&q=80',
  },
];

const CITIES: CityPlan[] = [
  {
    provinceId: 29,
    label: 'Ho Chi Minh',
    count: 50,
    wards: [
      71701001, 71701002, 71701003, 71701004, 71703005, 71703006, 71709007, 71703008, 71709009,
      71709010, 71709011, 71709012, 71705013, 71705014, 71705015, 71705016, 71705017, 71705018,
      71707019, 71707020,
    ],
    lat: [10.72, 10.86],
    lng: [106.62, 106.78],
    districts: ['Quan 1', 'Quan 3', 'Binh Thanh', 'Phu Nhuan', 'Tan Binh', 'Thu Duc'],
  },
  {
    provinceId: 1,
    label: 'Ha Noi',
    count: 50,
    wards: [
      10105001, 10105002, 10101003, 10101004, 10101005, 10107006, 10107007, 10107008, 10109009,
      10109010, 10109011, 10109012, 10113025, 10113026, 10113027, 10103028, 10111022, 10111023,
      10127043, 10127044, 10106039, 10106040,
    ],
    lat: [20.98, 21.08],
    lng: [105.78, 105.88],
    districts: ['Hoan Kiem', 'Ba Dinh', 'Dong Da', 'Cau Giay', 'Tay Ho', 'Ha Dong'],
  },
  {
    provinceId: 21,
    label: 'Da Nang',
    count: 25,
    wards: [
      50101001, 50101002, 50103003, 50115004, 50105005, 50105006, 50107007, 50109008, 50109009,
      50109010, 50115011, 50111012,
    ],
    lat: [15.99, 16.10],
    lng: [108.17, 108.28],
    districts: ['Hai Chau', 'Thanh Khe', 'Son Tra', 'Ngu Hanh Son', 'Lien Chieu'],
  },
  {
    provinceId: 33,
    label: 'Can Tho',
    count: 20,
    wards: [81519001, 81519002, 81519003, 81519004, 81521005, 81521006, 81523008, 81523009],
    lat: [10.00, 10.08],
    lng: [105.72, 105.82],
    districts: ['Ninh Kieu', 'Binh Thuy', 'Cai Rang', 'O Mon'],
  },
  {
    provinceId: 20,
    label: 'Hue',
    count: 15,
    wards: [41109001, 41119002, 41109003, 41101004, 41101005, 41101006, 41101007],
    lat: [16.42, 16.50],
    lng: [107.55, 107.65],
    districts: ['Thuan Hoa', 'Phu Xuan', 'Huong Thuy'],
  },
  {
    provinceId: 23,
    label: 'Khanh Hoa',
    count: 15,
    wards: [51101001, 51101002, 51101003, 51101004, 51109005, 51109006, 51109007],
    lat: [12.20, 12.30],
    lng: [109.15, 109.25],
    districts: ['Nha Trang', 'Cam Ranh', 'Dien Khanh'],
  },
  {
    provinceId: 28,
    label: 'Dong Nai',
    count: 10,
    wards: [71301001, 71301002, 71301003, 71301004, 71301005, 71301006],
    lat: [10.90, 11.02],
    lng: [106.78, 106.92],
    districts: ['Bien Hoa', 'Long Khanh', 'Trang Bom'],
  },
  {
    provinceId: 4,
    label: 'Hai Phong',
    count: 4,
    wards: [10301008, 10301009, 10303010, 10303011, 10305012, 10305013],
    lat: [20.82, 20.90],
    lng: [106.65, 106.75],
    districts: ['Hong Bang', 'Ngo Quyen', 'Le Chan'],
  },
  {
    provinceId: 3,
    label: 'Quang Ninh',
    count: 4,
    wards: [22501015, 22501017, 22501021, 22501022, 22503028],
    lat: [20.93, 21.02],
    lng: [107.05, 107.16],
    districts: ['Ha Long', 'Cam Pha', 'Uong Bi'],
  },
  {
    provinceId: 26,
    label: 'Lam Dong',
    count: 4,
    wards: [70301001, 70301002, 70301003, 70301004, 70305005],
    lat: [11.90, 11.98],
    lng: [108.40, 108.48],
    districts: ['Da Lat', 'Bao Loc', 'Duc Trong'],
  },
  {
    provinceId: 2,
    label: 'Bac Ninh',
    count: 3,
    wards: [22113001, 22113002, 22113003, 22113004],
    lat: [21.15, 21.22],
    lng: [106.02, 106.10],
    districts: ['Bac Ninh', 'Tu Son', 'Que Vo'],
  },
];

const SHOP_CATEGORIES: Record<StoreKindKey, ShopCategoryTemplate[]> = {
  spa: [
    { key: 'massage-tri-lieu', name: 'Massage tri lieu', parentSlug: 'spa-massage', description: 'Massage body, da nong, tinh dau va phuc hoi co vai gay.' },
    { key: 'facial-spa', name: 'Cham soc da mat', parentSlug: 'cham-soc-da-mat', description: 'Facial lam sach, cap am, tre hoa va lam sang da.' },
    { key: 'tam-trang-xong-hoi', name: 'Tam trang va xong hoi', parentSlug: 'xong-hoi-tam-trang', description: 'Xong hoi thao moc, tam trang va ngam thu gian.' },
    { key: 'body-care', name: 'Cham soc co the', parentSlug: 'cham-soc-co-the', description: 'Body scrub, u duong va wrap thao moc.' },
    { key: 'goi-dau', name: 'Goi dau duong sinh', parentSlug: 'spa-massage', description: 'Cham soc da dau, co vai gay va thao moc.' },
  ],
  nail: [
    { key: 'nail-gel', name: 'Nail gel va son mong', parentSlug: 'nail-mong-tay', description: 'Son gel, gel builder va cham soc mong.' },
    { key: 'nail-art', name: 'Nail art va dap bot', parentSlug: 'nail-mong-tay', description: 'Ve nghe thuat, charm, ombre va dap bot.' },
    { key: 'pedicure', name: 'Pedicure va foot care', parentSlug: 'nail-mong-tay', description: 'Cham soc chan, goi got va son mong chan.' },
    { key: 'waxing', name: 'Waxing diu nhe', parentSlug: 'triet-long', description: 'Waxing mat, tay, chan va vung nho.' },
    { key: 'lash-brow', name: 'Mi va chan may', parentSlug: 'long-may-mi-mat', description: 'Noi mi, lift mi va tao dang chan may.' },
  ],
  hair: [
    { key: 'cat-tao-kieu', name: 'Cat va tao kieu', parentSlug: 'toc-nu', description: 'Cat toc nu, tao kieu, goi say va tu van form toc.' },
    { key: 'nhuom-toc', name: 'Nhuom va highlight', parentSlug: 'toc-nu', description: 'Nhuom thoi trang, highlight, balayage va phu bac.' },
    { key: 'uon-duoi', name: 'Uon duoi ep toc', parentSlug: 'toc-nu', description: 'Uon setting, duoi collagen va ep phuc hoi.' },
    { key: 'phuc-hoi-toc', name: 'Phuc hoi toc', parentSlug: 'toc-nu', description: 'Keratin, olaplex, protein va hap dau cao cap.' },
    { key: 'makeup', name: 'Makeup va styling', parentSlug: 'trang-diem', description: 'Makeup du tiec, chup anh va styling toc.' },
  ],
  barber: [
    { key: 'cat-toc-nam', name: 'Cat toc nam', parentSlug: 'cat-toc-barber', description: 'Fade, undercut, pompadour va classic cut.' },
    { key: 'beard-care', name: 'Cao rau va cham soc beard', parentSlug: 'cat-toc-barber', description: 'Cao rau nong, tao kieu beard va duong da.' },
    { key: 'goi-dau-nam', name: 'Goi dau nam', parentSlug: 'spa-massage', description: 'Goi dau thao moc, massage co vai gay cho nam.' },
    { key: 'combo-grooming', name: 'Combo grooming', parentSlug: 'cat-toc-barber', description: 'Combo cat, cao rau, goi dau va styling.' },
    { key: 'massage-nam', name: 'Massage thu gian', parentSlug: 'spa-massage', description: 'Massage dau, vai gay va tay cho khach nam.' },
  ],
  skin: [
    { key: 'facial-basic', name: 'Facial va cap am', parentSlug: 'cham-soc-da-mat', description: 'Lam sach sau, cap am, dien di tinh chat va mat na.' },
    { key: 'tri-mun', name: 'Dieu tri mun va tham', parentSlug: 'cham-soc-da-mat', description: 'Lay nhan mun, giam tham, kiem soat dau va phuc hoi.' },
    { key: 'peel-da', name: 'Peel da hoa hoc', parentSlug: 'cham-soc-da-mat', description: 'AHA, BHA, enzyme peel va retinol peel.' },
    { key: 'laser-skin', name: 'Laser va tre hoa', parentSlug: 'tham-my-vien', description: 'Laser toning, RF, collagen va tre hoa da.' },
    { key: 'triet-long', name: 'Triet long laser', parentSlug: 'triet-long', description: 'Triet long diode, IPL va cham soc sau laser.' },
  ],
  yoga: [
    { key: 'yoga-basic', name: 'Yoga co ban va nang cao', parentSlug: 'yoga-thien', description: 'Hatha, Vinyasa, Yin va yoga can bang.' },
    { key: 'pilates', name: 'Pilates va core', parentSlug: 'fitness-pt', description: 'Mat pilates, reformer, core va mobility.' },
    { key: 'breathwork', name: 'Thien va breathwork', parentSlug: 'yoga-thien', description: 'Mindfulness, thien dinh va ky thuat tho.' },
    { key: 'personal-training', name: 'Personal training', parentSlug: 'fitness-pt', description: 'PT ca nhan, theo doi chi so va ke hoach tap.' },
    { key: 'yoga-tri-lieu', name: 'Yoga tri lieu', parentSlug: 'yoga-thien', description: 'Yoga phuc hoi, dau lung, prenatal va senior.' },
  ],
  aesthetic: [
    { key: 'nang-co', name: 'Nang co va cang da', parentSlug: 'tham-my-vien', description: 'HIFU, RF, thread lift va nang co khong phau thuat.' },
    { key: 'dieu-khac-face', name: 'Dieu khac khuon mat', parentSlug: 'tham-my-vien', description: 'Filler, botox, V-line va tu van ty le mat.' },
    { key: 'tre-hoa-cn', name: 'Tre hoa cong nghe cao', parentSlug: 'tham-my-vien', description: 'PRP, laser CO2, Thermage va Ultherapy.' },
    { key: 'triet-long-laser', name: 'Triet long laser', parentSlug: 'triet-long', description: 'Laser diode, IPL va triet long toan than.' },
    { key: 'giam-beo', name: 'Giam beo va dinh hinh', parentSlug: 'cham-soc-co-the', description: 'Cavitation, EMS, tan mo va tao duong cong.' },
    { key: 'tham-nam', name: 'Dieu tri tham nam', parentSlug: 'cham-soc-da-mat', description: 'Laser nam, IPL, pico va cham soc phuc hoi.' },
  ],
  lash: [
    { key: 'lash-extension', name: 'Noi mi classic va volume', parentSlug: 'long-may-mi-mat', description: 'Classic, hybrid, volume 2D-6D va mega volume.' },
    { key: 'lash-lift', name: 'Lift mi va uon mi', parentSlug: 'long-may-mi-mat', description: 'Lift mi keratin, uon mi va nhuom mi.' },
    { key: 'brow-shaping', name: 'Tao dang long may', parentSlug: 'long-may-mi-mat', description: 'Wax, thread, tint va brow lamination.' },
    { key: 'lash-care', name: 'Cham soc mi tu nhien', parentSlug: 'long-may-mi-mat', description: 'Duong mi, serum mi va thao mi an toan.' },
    { key: 'eye-combo', name: 'Combo mat', parentSlug: 'long-may-mi-mat', description: 'Combo mi, long may va makeup mat.' },
  ],
  pmu: [
    { key: 'phun-moi', name: 'Phun moi tham my', parentSlug: 'phun-xam-tham-my', description: 'Lip blush, ombre, khu tham nhe va phu bong moi.' },
    { key: 'phun-may', name: 'Phun va dieu khac chan may', parentSlug: 'phun-xam-tham-my', description: 'Microblading, powder brow va ombre brow.' },
    { key: 'phun-mi', name: 'Phun mi mat', parentSlug: 'phun-xam-tham-my', description: 'Eyeliner PMU, phun mi tren duoi va cham soc sau phun.' },
    { key: 'sau-phun', name: 'Cham soc sau phun', parentSlug: 'phun-xam-tham-my', description: 'Tai kham, bo sung mau va phuc hoi sau phun.' },
    { key: 'pmu-combo', name: 'Combo phun xam', parentSlug: 'phun-xam-tham-my', description: 'Goi moi, may, mi va cham soc tron goi.' },
  ],
  body: [
    { key: 'tam-trang', name: 'Tam trang toan than', parentSlug: 'xong-hoi-tam-trang', description: 'Tam trang sua de, glutathione, carbon va khoang.' },
    { key: 'body-scrub', name: 'Body scrub', parentSlug: 'cham-soc-co-the', description: 'Scrub muoi, ca phe, duong va thao moc.' },
    { key: 'u-body', name: 'U body va mat na co the', parentSlug: 'cham-soc-co-the', description: 'U collagen, wrap duong am va tinh chat.' },
    { key: 'xong-hoi', name: 'Xong hoi va ngam tam', parentSlug: 'xong-hoi-tam-trang', description: 'Xong hoi kho, uot, ngam thao duoc va onsen.' },
    { key: 'massage-body', name: 'Massage thu gian', parentSlug: 'spa-massage', description: 'Massage co ban ket hop body care.' },
  ],
};

const SERVICE_TEMPLATES: Record<StoreKindKey, ServiceTemplate[]> = {
  spa: [
    service('Massage da nong', 'massage-da-nong', 'massage-tri-lieu', 'massage da nong va thao moc', [350000, 560000, 820000], [60, 90, 120]),
    service('Massage body tinh dau', 'massage-body-tinh-dau', 'massage-tri-lieu', 'massage toan than voi tinh dau diu nhe', [280000, 480000, 720000], [60, 90, 120]),
    service('Massage co vai gay', 'massage-co-vai-gay', 'massage-tri-lieu', 'giam cang co vai gay va lung tren', [220000, 360000, 540000], [45, 60, 90]),
    service('Facial cap am phuc hoi', 'facial-cap-am-phuc-hoi', 'facial-spa', 'lam sach va cap am da mat', [320000, 520000, 780000], [60, 75, 90]),
    service('Tam trang thao moc', 'tam-trang-thao-moc', 'tam-trang-xong-hoi', 'tam trang va u body thao moc', [420000, 650000, 940000], [75, 100, 130]),
    service('Xong hoi detox', 'xong-hoi-detox', 'tam-trang-xong-hoi', 'xong hoi va ngam chan thanh loc', [180000, 320000, 520000], [30, 45, 60]),
    service('Body scrub muoi khoang', 'body-scrub-muoi-khoang', 'body-care', 'tay te bao chet va u duong body', [260000, 430000, 680000], [45, 75, 100]),
    service('Goi dau duong sinh', 'goi-dau-duong-sinh', 'goi-dau', 'goi dau thao moc va massage dau', [180000, 290000, 450000], [45, 60, 90]),
  ],
  nail: [
    service('Son gel Han Quoc', 'son-gel-han-quoc', 'nail-gel', 'son gel bong ben va cham soc mong', [150000, 260000, 420000], [45, 60, 90]),
    service('Dap gel builder', 'dap-gel-builder', 'nail-gel', 'dap gel tao form mong tu nhien', [280000, 420000, 620000], [75, 100, 130]),
    service('Nail art charm', 'nail-art-charm', 'nail-art', 've mong nghe thuat va gan charm', [220000, 380000, 580000], [75, 105, 135]),
    service('Pedicure spa', 'pedicure-spa', 'pedicure', 'cham soc chan va goi got', [180000, 300000, 480000], [45, 75, 100]),
    service('Waxing vung nho', 'waxing-vung-nho', 'waxing', 'waxing diu nhe cho mat va co the', [120000, 220000, 360000], [30, 45, 60]),
    service('Noi mi tu nhien', 'noi-mi-tu-nhien', 'lash-brow', 'noi mi classic nhe mat', [220000, 400000, 650000], [75, 100, 130]),
  ],
  hair: [
    service('Cat tao kieu nu', 'cat-tao-kieu-nu', 'cat-tao-kieu', 'cat toc va tu van form mat', [120000, 240000, 420000], [45, 60, 90]),
    service('Nhuom phu bac', 'nhuom-phu-bac', 'nhuom-toc', 'nhuom phu bac va cham soc toc', [350000, 620000, 980000], [120, 150, 180]),
    service('Balayage thoi trang', 'balayage-thoi-trang', 'nhuom-toc', 'nhuom balayage va highlight', [800000, 1400000, 2200000], [180, 240, 300]),
    service('Uon setting', 'uon-setting', 'uon-duoi', 'uon tao nep va cham soc sau hoa chat', [580000, 900000, 1400000], [150, 210, 270]),
    service('Duoi collagen', 'duoi-collagen', 'uon-duoi', 'duoi toc mem va giam xo', [520000, 860000, 1320000], [150, 210, 270]),
    service('Phuc hoi keratin', 'phuc-hoi-keratin', 'phuc-hoi-toc', 'hap phuc hoi va bo sung keratin', [380000, 680000, 1050000], [90, 120, 150]),
    service('Makeup du tiec', 'makeup-du-tiec', 'makeup', 'makeup va styling toc du tiec', [450000, 750000, 1200000], [90, 120, 150]),
  ],
  barber: [
    service('Classic haircut', 'classic-haircut', 'cat-toc-nam', 'cat toc nam co dien va goi say', [100000, 180000, 280000], [30, 45, 60]),
    service('Fade cut', 'fade-cut', 'cat-toc-nam', 'fade, taper va tao kieu hien dai', [150000, 260000, 420000], [45, 60, 75]),
    service('Cao rau nong', 'cao-rau-nong', 'beard-care', 'cao rau khan nong va duong da', [90000, 160000, 260000], [30, 45, 60]),
    service('Beard styling', 'beard-styling', 'beard-care', 'tao kieu rau va duong beard oil', [120000, 220000, 340000], [30, 45, 60]),
    service('Goi dau thao moc nam', 'goi-dau-thao-moc-nam', 'goi-dau-nam', 'goi dau va massage co vai gay', [140000, 240000, 360000], [45, 60, 75]),
    service('Combo gentleman', 'combo-gentleman', 'combo-grooming', 'cat toc, cao rau, goi dau va styling', [260000, 420000, 650000], [75, 100, 130]),
  ],
  skin: [
    service('Facial lam sach sau', 'facial-lam-sach-sau', 'facial-basic', 'lam sach sau va cap am', [280000, 480000, 760000], [60, 75, 90]),
    service('Tri mun chuyen sau', 'tri-mun-chuyen-sau', 'tri-mun', 'lay nhan mun va giam viem', [350000, 620000, 980000], [75, 100, 130]),
    service('Giam tham sau mun', 'giam-tham-sau-mun', 'tri-mun', 'serum phuc hoi va lam sang', [420000, 720000, 1100000], [75, 100, 130]),
    service('Peel AHA BHA', 'peel-aha-bha', 'peel-da', 'peel da va phuc hoi hang rao da', [500000, 850000, 1300000], [60, 90, 120]),
    service('Laser toning', 'laser-toning', 'laser-skin', 'laser lam sang va deu mau da', [850000, 1500000, 2400000], [60, 90, 120]),
    service('Triet long diode', 'triet-long-diode', 'triet-long', 'triet long bang cong nghe diode', [300000, 650000, 1200000], [45, 75, 100]),
  ],
  yoga: [
    service('Hatha yoga', 'hatha-yoga', 'yoga-basic', 'lop yoga nen tang va can bang', [150000, 350000, 850000], [60, 75, 90]),
    service('Vinyasa flow', 'vinyasa-flow', 'yoga-basic', 'chuoi dong tac lien tuc va linh hoat', [180000, 420000, 950000], [60, 75, 90]),
    service('Reformer pilates', 'reformer-pilates', 'pilates', 'pilates voi may reformer', [280000, 650000, 1400000], [50, 60, 75]),
    service('Breathwork session', 'breathwork-session', 'breathwork', 'ky thuat tho va thien dinh', [180000, 360000, 780000], [45, 60, 90]),
    service('PT ca nhan', 'pt-ca-nhan', 'personal-training', 'huan luyen ca nhan theo muc tieu', [350000, 750000, 1600000], [60, 90, 120]),
    service('Yoga tri lieu dau lung', 'yoga-tri-lieu-dau-lung', 'yoga-tri-lieu', 'yoga phuc hoi cho lung va cot song', [220000, 480000, 980000], [60, 75, 90]),
  ],
  aesthetic: [
    service('HIFU nang co', 'hifu-nang-co', 'nang-co', 'nang co khong phau thuat', [1200000, 2600000, 5200000], [60, 90, 120]),
    service('RF tre hoa da', 'rf-tre-hoa-da', 'tre-hoa-cn', 'song RF kich thich collagen', [850000, 1600000, 3000000], [60, 90, 120]),
    service('Filler tao hinh', 'filler-tao-hinh', 'dieu-khac-face', 'tu van va tao hinh duong net', [1800000, 3600000, 6800000], [45, 75, 100]),
    service('Laser tri nam', 'laser-tri-nam', 'tham-nam', 'laser pico va phuc hoi da', [950000, 1900000, 3600000], [60, 90, 120]),
    service('Giam beo cavitation', 'giam-beo-cavitation', 'giam-beo', 'tan mo va dinh hinh co the', [650000, 1300000, 2500000], [75, 100, 130]),
    service('Triet long toan than', 'triet-long-toan-than', 'triet-long-laser', 'triet long laser nhieu vung', [900000, 1800000, 3200000], [90, 120, 150]),
  ],
  lash: [
    service('Noi mi classic', 'noi-mi-classic', 'lash-extension', 'noi mi 1:1 tu nhien', [220000, 380000, 620000], [75, 100, 130]),
    service('Noi mi volume', 'noi-mi-volume', 'lash-extension', 'volume 3D-6D mem nhe', [360000, 560000, 850000], [100, 130, 160]),
    service('Lift mi keratin', 'lift-mi-keratin', 'lash-lift', 'lift mi va duong keratin', [260000, 420000, 620000], [60, 75, 90]),
    service('Brow lamination', 'brow-lamination', 'brow-shaping', 'dinh hinh va lamination long may', [300000, 480000, 720000], [60, 75, 90]),
    service('Thao mi an toan', 'thao-mi-an-toan', 'lash-care', 'thao mi va cham soc mi that', [120000, 220000, 340000], [30, 45, 60]),
    service('Combo lash brow', 'combo-lash-brow', 'eye-combo', 'noi mi va tao dang long may', [520000, 760000, 1100000], [120, 150, 180]),
  ],
  pmu: [
    service('Phun moi lip blush', 'phun-moi-lip-blush', 'phun-moi', 'phun moi trong treo va deu mau', [1800000, 3200000, 5200000], [120, 150, 180]),
    service('Phun moi khu tham', 'phun-moi-khu-tham', 'phun-moi', 'xu ly nen moi tham va phun mau', [2200000, 3800000, 6000000], [150, 180, 210]),
    service('Microblading chan may', 'microblading-chan-may', 'phun-may', 'dieu khac soi may tu nhien', [2000000, 3600000, 5800000], [120, 150, 180]),
    service('Powder brow', 'powder-brow', 'phun-may', 'phun may hat bot mem min', [1800000, 3200000, 5200000], [120, 150, 180]),
    service('Phun mi eyeliner', 'phun-mi-eyeliner', 'phun-mi', 'phun mi sat chan mi tu nhien', [1500000, 2600000, 4200000], [90, 120, 150]),
    service('Tai kham bo sung mau', 'tai-kham-bo-sung-mau', 'sau-phun', 'kiem tra va bo sung mau sau bong', [400000, 800000, 1400000], [60, 90, 120]),
  ],
  body: [
    service('Tam trang sua de', 'tam-trang-sua-de', 'tam-trang', 'tam trang va duong am toan than', [420000, 680000, 980000], [75, 100, 130]),
    service('Tam trang carbon', 'tam-trang-carbon', 'tam-trang', 'lam sang da voi carbon va khoang', [520000, 850000, 1250000], [90, 120, 150]),
    service('Body scrub ca phe', 'body-scrub-ca-phe', 'body-scrub', 'tay te bao chet va lam min da', [260000, 420000, 620000], [45, 75, 100]),
    service('U body collagen', 'u-body-collagen', 'u-body', 'u duong collagen va cap am sau', [360000, 580000, 860000], [60, 90, 120]),
    service('Xong hoi onsen', 'xong-hoi-onsen', 'xong-hoi', 'xong hoi va ngam tam thu gian', [280000, 460000, 760000], [60, 90, 120]),
    service('Massage body co ban', 'massage-body-co-ban', 'massage-body', 'massage thu gian ket hop body care', [260000, 450000, 700000], [60, 90, 120]),
  ],
};

function service(
  name: string,
  baseSlug: string,
  categoryKey: string,
  focus: string,
  price: [number, number, number],
  duration: [number, number, number],
): ServiceTemplate {
  return {
    name,
    baseSlug,
    categoryKey,
    focus,
    imageUrl: 'https://images.unsplash.com/photo-1591343395082-e120087004b4?auto=format&fit=crop&w=900&q=80',
    price,
    duration,
  };
}

function cityForIndex(index: number): CityPlan {
  let cursor = 0;
  for (const city of CITIES) {
    cursor += city.count;
    if (index <= cursor) return city;
  }
  throw new Error(`No city configured for store ${index}`);
}

function kindForIndex(index: number): StoreKind {
  let cursor = 0;
  for (const kind of STORE_KINDS) {
    cursor += kind.count;
    if (index <= cursor) return kind;
  }
  throw new Error(`No store kind configured for store ${index}`);
}

function subStore(slug: string): string {
  return `(SELECT \`id\` FROM \`stores\` WHERE \`slug\` = ${sql(slug)} LIMIT 1)`;
}

function subUser(email: string): string {
  return `(SELECT \`id\` FROM \`users\` WHERE \`email\` = ${sql(email)} LIMIT 1)`;
}

function subRole(code: 'SHOP_OWNER' | 'SHOP_STAFF'): string {
  return `(SELECT \`id\` FROM \`roles\` WHERE \`code\` = ${sql(code)} AND \`store_id\` IS NULL LIMIT 1)`;
}

function subStaff(email: string, storeSlug: string): string {
  return `(SELECT st.\`id\` FROM \`staff\` st JOIN \`users\` u ON u.\`id\` = st.\`user_id\` WHERE u.\`email\` = ${sql(email)} AND st.\`store_id\` = ${subStore(storeSlug)} LIMIT 1)`;
}

function subShopCategory(name: string, storeSlug: string): string {
  return `(SELECT \`id\` FROM \`service_categories\` WHERE \`name\` = ${sql(name)} AND \`store_id\` =${subStore(storeSlug)} LIMIT 1)`;
}

function subGlobalCategory(slug: string): string {
  return `(SELECT parent_cat.\`id\` FROM (SELECT \`id\` FROM \`service_categories\` WHERE \`slug\` = ${sql(slug)} AND \`store_id\` IS NULL LIMIT 1) AS parent_cat)`;
}

function subService(serviceSlug: string, storeSlug: string): string {
  return `(SELECT \`id\` FROM \`services\` WHERE \`slug\` = ${sql(serviceSlug)} AND \`store_id\` =${subStore(storeSlug)} LIMIT 1)`;
}

function makeStores(): StoreSeed[] {
  const stores: StoreSeed[] = [];
  for (let index = 1; index <= 200; index++) {
    const rand = seededRand(index * 1999);
    const kind = kindForIndex(index);
    const city = cityForIndex(index);
    const code = String(index).padStart(3, '0');
    const brand = BRANDS[(index - 1) % BRANDS.length];
    const suffix = pick(kind.suffixes, rand);
    const name = `${brand} ${suffix} ${code}`;
    stores.push({
      index,
      code,
      kind,
      city,
      name,
      slug: `${slugify(brand)}-${slugify(suffix)}-${code}-${slugify(city.label)}`,
      ownerEmail: `owner.s${code}@glowora.local`,
      staffEmails: [],
      serviceSlugs: [],
    });
  }
  return stores;
}

function personName(seed: number): string {
  return FIRST_NAMES[seed % FIRST_NAMES.length];
}

function buildStoreDescription(store: StoreSeed, address: string, district: string): string {
  return [
    '<div class="store-description">',
    `  <h3>${store.name}</h3>`,
    `  <p>${store.name} la mot diem den demo thuoc nhom ${store.kind.label} tai ${district}, ${store.city.label}. Khong gian duoc mo ta theo huong gan gui, gon gang va de tao cam giac tin cay ngay tu lan dau khach hang xem thong tin. Cua hang phu hop cho nhung nguoi muon tim mot noi co quy trinh ro rang, lich hen linh hoat, thong tin minh bach va trai nghiem on dinh. Dia chi demo tai ${address} giup du lieu co ngu canh dia phuong khi kiem thu ban do, bo loc khu vuc, tim kiem theo thanh pho va trang chi tiet cua tung co so.</p>`,
    `  <p>Diem manh cua ${store.name} nam o cach sap xep dich vu theo nhom nhu cau thay vi chi liet ke ten goi. Khach hang bat dau tu nhu cau thu gian, cham soc ca nhan, cai thien ngoai hinh, phuc hoi the trang hoac duy tri lich cham soc dinh ky. Tung nhom dich vu duoc mo ta de he thong co noi dung day du hon khi hien thi tren trang public, trong ket qua tim kiem, trong luong dat lich va trong cac man hinh quan tri. Dieu nay giup viec test giao dien, SEO noi bo, chatbot va goi y dich vu co du lieu gan voi ngu canh thuc te hon.</p>`,
    `  <p>Quy trinh van hanh cua cua hang duoc mo phong theo mot co so dich vu hien dai. Khach hang se duoc xem gio mo cua, chon dich vu, chon nhan vien phu hop, chon khung gio, xac nhan thong tin ca nhan va theo doi trang thai lich hen. Doi ngu store duoc trao quyen quan ly danh muc, gia, thoi luong, nhan su, lich lam viec va danh gia sau khi hoan thanh. Mo ta nay co chu dich dai hon de kiem thu cac thanh phan rich text, layout card, trang chi tiet, cat ngan noi dung va cac truong hop hien thi tren mobile.</p>`,
    `  <p>Khong gian cua ${store.name} duoc dinh vi la than thien nhung van chuyen nghiep. Khu vuc tiep don can co thong tin lich hen ro rang, nhan vien nam duoc nhu cau cua khach va huong dan tung buoc truoc khi bat dau. Khu vuc thuc hien dich vu uu tien ve sinh, su rieng tu va su thoai mai. Cac vat tu, san pham va dung cu trong du lieu demo duoc mo ta theo huong an toan, nhe diu, co kiem soat va phu hop voi nhieu tinh huong dat lich khac nhau.</p>`,
    `  <p>Voi nhom ${store.kind.label}, cua hang phuc vu ca khach hang lan dau trai nghiem lan khach hang quay lai theo chu ky. Noi dung mo ta tap trung vao cam giac yen tam, kha nang tu van truoc dich vu, su thong nhat trong thao tac va viec theo doi ket qua sau khi hoan tat. Khi dung du lieu nay trong demo, tung store co du noi dung de kiem tra tim kiem toan van, hien thi do dai khac nhau, loc theo danh muc va danh gia muc do phu hop cua dich vu voi nhu cau ca nhan.</p>`,
    `  <p>${store.name} cung la mot ban ghi demo de kiem thu cac tinh nang danh cho chu store. Owner duoc phep truy cap bang dieu khien, cap nhat thong tin cua hang, quan ly nhan vien, gan dich vu cho tung nhan vien, dieu chinh lich nghi va theo doi booking. Cac truong mo ta dai giup phat hien som loi tran layout, loi xu ly HTML, loi cat chu, loi ma hoa tieng Viet va loi hieu nang khi trang tai nhieu noi dung cung luc.</p>`,
    `  <p>Tom lai, ${store.name} khong chi la mot cua hang demo de lap day danh sach. Ban ghi nay dai hon de tao cam giac giong mot ho so kinh doanh that, co boi canh dia phuong, co dinh vi dich vu, co quy trinh van hanh va co ky vong trai nghiem cho khach. Noi dung nay giup cac man hinh frontend, API tim kiem, chatbot, thong bao va cong cu quan tri co du chat lieu de kiem thu trong cac tinh huong gan voi san pham thuc te.</p>`,
    '</div>',
  ].join('\n');
}

function buildServiceDescription(store: StoreSeed, serviceName: string, serviceTemplate: ServiceTemplate, categoryName: string): string {
  return [
    '<div class="service-description">',
    `  <h3>${serviceName}</h3>`,
    `  <p>${serviceName} tai ${store.name} la goi dich vu demo thuoc nhom ${categoryName}, duoc viet dai hon de mo phong noi dung tu van tren mot trang dat lich that. Dich vu tap trung vao ${serviceTemplate.focus}, phu hop voi khach hang muon co mot trai nghiem duoc giai thich ro truoc khi quyet dinh dat hen. Noi dung nay giup nguoi dung hieu muc tieu cua lieu trinh, cach nhan vien tiep nhan nhu cau, nhung diem can luu y va ly do nen chon khung gio phu hop voi lich sinh hoat ca nhan.</p>`,
    `  <p>Truoc khi bat dau, nhan vien se ghi nhan tinh trang hien tai, mong muon cua khach va cac yeu to anh huong den ket qua. Voi dich vu ${serviceTemplate.focus}, buoc tu van co vai tro quan trong vi tung khach hang co nen tang, thoi quen cham soc, muc do nhay cam va ky vong khac nhau. Phan mo ta dai nay tao du lieu tot hon cho chatbot, trang chi tiet dich vu, tooltip, ket qua tim kiem va cac man hinh so sanh dich vu trong cung mot cua hang.</p>`,
    `  <p>Quy trinh thuc hien duoc mo phong theo huong co cau truc: tiep nhan, lam sach hoac chuan bi khu vuc can cham soc, tien hanh cac buoc chinh, kiem tra phan hoi cua khach, hoan thien ket qua va huong dan cham soc sau dich vu. Tung buoc khong nhat thiet dai trong thuc te, nhung can du ro de khach hang cam thay minh biet dieu gi se xay ra. Dieu nay dac biet huu ich khi kiem thu luong dat lich nhieu dich vu, hien thi thoi luong va gan nhan vien co chuyen mon.</p>`,
    `  <p>Khach hang nen chon ${serviceName} khi can mot phuong an on dinh, de hieu va de lap lai theo chu ky. Goi nay khong duoc mo ta nhu mot cam ket ket qua tuyet doi, ma nhu mot trai nghiem duoc chuan hoa, duoc dieu chinh theo tinh trang thuc te. Neu khach hang co tien su kich ung, dang dieu tri da, vua thuc hien thu thuat khac hoac co lich trinh dac biet, nhan vien nen hoi ky truoc khi bat dau de dam bao viec phuc vu phu hop.</p>`,
    `  <p>Trong bo du lieu demo, dich vu nay cung giup kiem tra cac chuc nang lien quan den gia, bien the thoi luong, danh muc, anh dai dien, danh gia trung binh va phan cong nhan vien. Khi noi dung mo ta dai hon, frontend duoc thu nghiem voi cac truong hop nhu thu gon van ban, hien thi rich text, can bang chieu cao card, render tren mobile, tim kiem theo tu khoa dai va doc noi dung bang cong cu ho tro truy cap.</p>`,
    `  <p>Sau khi hoan thanh, khach hang nen duoc nhac ve cach cham soc tai nha, khoang thoi gian nen quay lai va nhung dau hieu can theo doi. Voi ${serviceTemplate.focus}, phan huong dan sau dich vu giup nang cao cam giac chuyen nghiep va lam cho trai nghiem khong ket thuc ngay tai thoi diem thanh toan. Cua hang dung thong tin nay de gui thong bao, tao ghi chu booking, hoac lam noi dung tham khao cho nhan vien vua vao lam.</p>`,
    '  <ul>',
    '    <li>Tu van nhu cau, tinh trang hien tai va muc tieu truoc khi bat dau.</li>',
    '    <li>Thuc hien theo quy trinh ve sinh, thao tac ro rang va co kiem tra phan hoi.</li>',
    '    <li>Su dung san pham hoac dung cu phu hop voi tinh huong dich vu da chon.</li>',
    '    <li>Ghi nhan luu y sau dich vu de khach de theo doi va dat lich lan tiep theo.</li>',
    '  </ul>',
    `  <p>${serviceName} duoc tao ra de lam cho du lieu cua ${store.name} co chieu sau hon. Noi dung khong chi phuc vu viec doc mo ta, ma con giup he thong co them ngu lieu de kiem tra tim kiem, sap xep, goi y, hien thi danh sach va xu ly cac truong rich text dai. Khi dung trong demo, goi dich vu nay tao cam giac gan voi mot co so that: co muc tieu, co quy trinh, co canh bao nhe, co huong dan sau dich vu va co ly do de khach hang quay lai.</p>`,
    '</div>',
  ].join('\n');
}

function roundedPrice(value: number, rand: () => number): number {
  const delta = randInt(-3, 3, rand) * 10000;
  return Math.max(80000, Math.round((value + delta) / 10000) * 10000);
}

function render(): { sql: string; accounts: string; stats: Record<string, number> } {
  const stores = makeStores();
  const sqlLines: string[] = [
    '-- ============================================================',
    '-- SEED: 200 Demo Stores - Glowora Platform',
    `-- Generated: ${new Date().toISOString()}`,
    '-- Password for all owner/staff accounts: Owner@123456',
    '-- Prerequisite: pnpm run db:seed and prisma/seed_provinces_wards.sql',
    '-- ============================================================',
    'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;',
    'START TRANSACTION;',
    '',
    `SET @demo_password_hash = ${sql(PASSWORD_HASH)};`,
    '',
  ];

  const ownerUserRows: string[] = [];
  const staffUserRows: string[] = [];
  const storeRows: string[] = [];
  const workingHourRows: string[] = [];
  const ownerRoleRows: string[] = [];
  const staffRows: string[] = [];
  const staffRoleRows: string[] = [];
  const scheduleRows: string[] = [];
  const shopCategoryRows: string[] = [];
  const serviceRows: string[] = [];
  const variantRows: string[] = [];
  const staffServiceRows: string[] = [];
  const accounts: string[] = [
    '# Glowora seed 200 accounts',
    '',
    'Password for every account: `Owner@123456`',
    '',
    '| Store | Store name | Owner email | Staff emails |',
    '|---|---|---|---|',
  ];

  for (const store of stores) {
    const rand = seededRand(store.index * 1777);
    const lat = store.city.lat[0] + rand() * (store.city.lat[1] - store.city.lat[0]);
    const lng = store.city.lng[0] + rand() * (store.city.lng[1] - store.city.lng[0]);
    const wardId = pick(store.city.wards, rand);
    const district = pick(store.city.districts, rand);
    const address = `${randInt(1, 199, rand)} ${pick(['Nguyen Hue', 'Le Loi', 'Tran Hung Dao', 'Hai Ba Trung', 'Phan Chu Trinh', 'Ly Thuong Kiet'], rand)}`;
    const staffCount = randInt(3, 10, seededRand(store.index));
    const serviceCount = randInt(20, 40, seededRand(store.index + 1000));

    ownerUserRows.push(
      `(${sql(randomUUID())}, ${sql(personName(store.index - 1))}, ${sql(store.ownerEmail)}, @demo_password_hash, ${sql(`0905${store.code}00`)}, 'ACTIVE', NOW(), NOW())`,
    );

    storeRows.push(
      `(${sql(randomUUID())}, ${sql(store.slug)}, ${subUser(store.ownerEmail)}, ${sql(store.name)}, ${sql(`02871${store.code}00`)}, ${sql(`hello.s${store.code}@glowora.local`)}, ${sql(`https://${store.slug}.glowora.local`)}, ${sql(buildStoreDescription(store, address, district))}, ${sql(address)}, ${store.city.provinceId}, ${wardId}, ${lat.toFixed(6)}, ${lng.toFixed(6)}, NULL, ${sql(store.kind.imageUrl)}, 'ACTIVE', NOW(), 'Asia/Ho_Chi_Minh', 30, 2, 30, ${store.index % 2 === 0 ? 'TRUE' : 'FALSE'}, ${(4.2 + rand() * 0.7).toFixed(2)}, ${randInt(12, 180, rand)}, NOW(), NOW())`,
    );

    ownerRoleRows.push(
      `(${sql(randomUUID())}, ${subUser(store.ownerEmail)}, ${subRole('SHOP_OWNER')}, ${subStore(store.slug)}, NOW())`,
    );

    staffRows.push(
      `(${sql(randomUUID())}, ${subUser(store.ownerEmail)}, ${subStore(store.slug)}, NULL, NULL, 0.00, 0, 'ACTIVE', NULL, NULL, NOW(), NOW())`,
    );

    for (const day of DAYS) {
      const isSunday = day === 'SUNDAY';
      const openTime = store.kind.key === 'barber' ? '09:00' : '08:30';
      const closeTime = store.kind.key === 'yoga' ? '21:00' : '20:30';
      workingHourRows.push(
        `(${sql(randomUUID())}, ${subStore(store.slug)}, '${day}', ${sql(openTime)}, ${sql(closeTime)}, ${isSunday && store.index % 4 === 0 ? 'TRUE' : 'FALSE'})`,
      );
    }

    for (let staffIndex = 1; staffIndex <= staffCount; staffIndex++) {
      const staffEmail = `staff.s${store.code}u${String(staffIndex).padStart(2, '0')}@glowora.local`;
      store.staffEmails.push(staffEmail);
      const staffName = personName(store.index * 17 + staffIndex * 7);
      const specialty = pick(store.kind.staffSpecialties, seededRand(staffIndex * 991 + store.index));

      staffUserRows.push(
        `(${sql(randomUUID())}, ${sql(staffName)}, ${sql(staffEmail)}, @demo_password_hash, ${sql(`091${store.code}${String(staffIndex).padStart(2, '0')}`)}, 'ACTIVE', NOW(), NOW())`,
      );
      staffRows.push(
        `(${sql(randomUUID())}, ${subUser(staffEmail)}, ${subStore(store.slug)}, ${sql(specialty)}, ${sql(`Phu trach ${specialty.toLowerCase()} tai ${store.name}.`)}, ${(4.1 + rand() * 0.8).toFixed(2)}, ${randInt(6, 90, rand)}, 'ACTIVE', NULL, NULL, NOW(), NOW())`,
      );
      staffRoleRows.push(
        `(${sql(randomUUID())}, ${subUser(staffEmail)}, ${subRole('SHOP_STAFF')}, ${subStore(store.slug)}, NOW())`,
      );

      const daysOff = staffIndex % 3 === 0 ? ['SUNDAY'] : staffIndex % 3 === 1 ? ['MONDAY'] : ['TUESDAY'];
      for (const day of DAYS) {
        if (daysOff.includes(day)) continue;
        scheduleRows.push(
          `(${sql(randomUUID())}, ${subStore(store.slug)}, ${subStaff(staffEmail, store.slug)}, '${day as DayOfWeek}', ${sql(staffIndex % 2 === 0 ? '10:00' : '09:00')}, ${sql(staffIndex % 2 === 0 ? '19:00' : '18:00')}, TRUE)`,
        );
      }
    }

    const categories = SHOP_CATEGORIES[store.kind.key];
    for (const category of categories) {
      shopCategoryRows.push(
        `(${sql(randomUUID())}, ${sql(category.name)}, NULL, ${sql(category.description)}, NULL, ${subStore(store.slug)}, ${subGlobalCategory(category.parentSlug)}, NOW(), NOW())`,
      );
    }

    const templates = SERVICE_TEMPLATES[store.kind.key];
    for (let serviceIndex = 1; serviceIndex <= serviceCount; serviceIndex++) {
      const template = templates[(serviceIndex - 1) % templates.length];
      const localRand = seededRand(store.index * 10000 + serviceIndex);
      const serviceSlug = `${template.baseSlug}-${String(serviceIndex).padStart(2, '0')}`;
      store.serviceSlugs.push(serviceSlug);
      const serviceName = `${template.name} ${serviceIndex > templates.length ? serviceIndex : ''}`.trim();
      const category = categories.find((item) => item.key === template.categoryKey) ?? categories[0];

      serviceRows.push(
        `(${sql(randomUUID())}, ${subStore(store.slug)}, ${subShopCategory(category.name, store.slug)}, ${sql(serviceName)}, ${sql(serviceSlug)}, ${sql(buildServiceDescription(store, serviceName, template, category.name))}, ${sql(JSON.stringify([template.imageUrl]))}, 'ACTIVE', ${(4.15 + localRand() * 0.75).toFixed(2)}, NOW(), NOW())`,
      );

      const variantCount = serviceIndex <= 10 ? randInt(2, 4, localRand) : randInt(1, 2, localRand);
      for (let variantIndex = 0; variantIndex < variantCount; variantIndex++) {
        const duration = template.duration[Math.min(variantIndex, 2)];
        const price = roundedPrice(template.price[Math.min(variantIndex, 2)], localRand);
        const label = variantIndex === 0 ? 'Co ban' : variantIndex === 1 ? 'Nang cao' : variantIndex === 2 ? 'VIP' : 'Signature';
        variantRows.push(
          `(${sql(randomUUID())}, ${subService(serviceSlug, store.slug)}, ${sql(`${duration} phut - ${label}`)}, ${sql(`${label} cho ${serviceName}, thoi luong ${duration} phut.`)}, ${duration}, ${money(price)}, ${money(Math.round(price * 0.48))}, ${variantIndex}, 'ACTIVE', NOW(), NOW())`,
        );
      }
    }

    const assignmentSet = new Set<string>();
    store.serviceSlugs.forEach((serviceSlug, serviceIndex) => {
      const staffEmail = store.staffEmails[serviceIndex % store.staffEmails.length];
      assignmentSet.add(`${staffEmail}|${serviceSlug}`);
    });
    for (const staffEmail of store.staffEmails) {
      const staffRand = seededRand(store.index * 7919 + store.staffEmails.indexOf(staffEmail));
      for (const serviceSlug of store.serviceSlugs) {
        if (staffRand() < 0.6) assignmentSet.add(`${staffEmail}|${serviceSlug}`);
      }
    }
    for (const assignment of assignmentSet) {
      const [staffEmail, serviceSlug] = assignment.split('|');
      staffServiceRows.push(`(${subStaff(staffEmail, store.slug)}, ${subService(serviceSlug, store.slug)})`);
    }

    accounts.push(`| ${store.code} | ${viText(store.name)} | \`${store.ownerEmail}\` | ${store.staffEmails.map((email) => `\`${email}\``).join('<br>')} |`);
  }

  sqlLines.push('-- SECTION 0: Safety cleanup for regenerated demo seed');
  sqlLines.push('SET FOREIGN_KEY_CHECKS = 0;');
  sqlLines.push("DELETE FROM `staff_services` WHERE `staff_id` IN (SELECT st.`id` FROM `staff` st JOIN `stores` s ON s.`id` = st.`store_id` WHERE s.`email` LIKE 'hello.s%@glowora.local');");
  sqlLines.push("DELETE FROM `service_variants` WHERE `service_id` IN (SELECT sv.`id` FROM `services` sv JOIN `stores` s ON s.`id` = sv.`store_id` WHERE s.`email` LIKE 'hello.s%@glowora.local');");
  sqlLines.push("DELETE FROM `services` WHERE `store_id` IN (SELECT `id` FROM `stores` WHERE `email` LIKE 'hello.s%@glowora.local');");
  sqlLines.push("DELETE FROM `staff_schedules` WHERE `store_id` IN (SELECT `id` FROM `stores` WHERE `email` LIKE 'hello.s%@glowora.local');");
  sqlLines.push("DELETE FROM `user_roles` WHERE `store_id` IN (SELECT `id` FROM `stores` WHERE `email` LIKE 'hello.s%@glowora.local');");
  sqlLines.push("DELETE FROM `staff` WHERE `store_id` IN (SELECT `id` FROM `stores` WHERE `email` LIKE 'hello.s%@glowora.local');");
  sqlLines.push("DELETE FROM `service_categories` WHERE `store_id` IN (SELECT `id` FROM `stores` WHERE `email` LIKE 'hello.s%@glowora.local');");
  sqlLines.push("DELETE FROM `stores` WHERE `email` LIKE 'hello.s%@glowora.local';");
  sqlLines.push("DELETE FROM `users` WHERE `email` LIKE 'owner.s%@glowora.local' OR `email` LIKE 'staff.s%@glowora.local';");
  sqlLines.push('SET FOREIGN_KEY_CHECKS = 1;');
  sqlLines.push('');

  sqlLines.push('-- SECTION 1: Owner users');
  sqlLines.push(
    ...batchInsert(ownerUserRows, 'users', ['id', 'full_name', 'email', 'password', 'phone', 'status', 'created_at', 'updated_at'], {
      suffix:
        'ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`), `password` = VALUES(`password`), `phone` = VALUES(`phone`), `status` = VALUES(`status`), `updated_at` = NOW();',
    }),
  );

  sqlLines.push('-- SECTION 2: Staff users');
  sqlLines.push(
    ...batchInsert(staffUserRows, 'users', ['id', 'full_name', 'email', 'password', 'phone', 'status', 'created_at', 'updated_at'], {
      suffix:
        'ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`), `password` = VALUES(`password`), `phone` = VALUES(`phone`), `status` = VALUES(`status`), `updated_at` = NOW();',
    }),
  );

  sqlLines.push('-- SECTION 3: Stores');
  sqlLines.push(
    ...batchInsert(
      storeRows,
      'stores',
      [
        'id',
        'slug',
        'owner_id',
        'name',
        'phone',
        'email',
        'website',
        'description',
        'address',
        'province_id',
        'ward_id',
        'latitude',
        'longitude',
        'logo_url',
        'banner_url',
        'status',
        'approved_at',
        'timezone',
        'slot_interval_mins',
        'cancel_before_hours',
        'max_advance_days',
        'auto_confirm',
        'avg_rating',
        'total_reviews',
        'created_at',
        'updated_at',
      ],
      {
        batchSize: 25,
        suffix:
          'ON DUPLICATE KEY UPDATE `owner_id` = VALUES(`owner_id`), `name` = VALUES(`name`), `phone` = VALUES(`phone`), `email` = VALUES(`email`), `description` = VALUES(`description`), `address` = VALUES(`address`), `province_id` = VALUES(`province_id`), `ward_id` = VALUES(`ward_id`), `latitude` = VALUES(`latitude`), `longitude` = VALUES(`longitude`), `banner_url` = VALUES(`banner_url`), `status` = VALUES(`status`), `updated_at` = NOW();',
      },
    ),
  );

  sqlLines.push('-- SECTION 4: Working hours');
  sqlLines.push(
    ...batchInsert(workingHourRows, 'working_hours', ['id', 'store_id', 'day_of_week', 'open_time', 'close_time', 'is_closed'], {
      suffix:
        'ON DUPLICATE KEY UPDATE `open_time` = VALUES(`open_time`), `close_time` = VALUES(`close_time`), `is_closed` = VALUES(`is_closed`);',
    }),
  );

  sqlLines.push('-- SECTION 5: Owner user roles');
  sqlLines.push(
    ...batchInsert(ownerRoleRows, 'user_roles', ['id', 'user_id', 'role_id', 'store_id', 'created_at'], {
      suffix: 'ON DUPLICATE KEY UPDATE `created_at` = `created_at`;',
    }),
  );

  sqlLines.push('-- SECTION 6: Staff profiles');
  sqlLines.push(
    ...batchInsert(staffRows, 'staff', ['id', 'user_id', 'store_id', 'specialty', 'bio', 'rating', 'total_reviews', 'status', 'telegram_chat_id', 'telegram_link_token', 'created_at', 'updated_at'], {
      suffix:
        'ON DUPLICATE KEY UPDATE `specialty` = VALUES(`specialty`), `bio` = VALUES(`bio`), `rating` = VALUES(`rating`), `total_reviews` = VALUES(`total_reviews`), `status` = VALUES(`status`), `updated_at` = NOW();',
    }),
  );

  sqlLines.push('-- SECTION 7: Staff user roles');
  sqlLines.push(
    ...batchInsert(staffRoleRows, 'user_roles', ['id', 'user_id', 'role_id', 'store_id', 'created_at'], {
      suffix: 'ON DUPLICATE KEY UPDATE `created_at` = `created_at`;',
    }),
  );

  sqlLines.push('-- SECTION 8: Staff schedules');
  sqlLines.push(
    ...batchInsert(scheduleRows, 'staff_schedules', ['id', 'store_id', 'staff_id', 'day_of_week', 'start_time', 'end_time', 'is_active'], {
      suffix:
        'ON DUPLICATE KEY UPDATE `start_time` = VALUES(`start_time`), `end_time` = VALUES(`end_time`), `is_active` = VALUES(`is_active`);',
    }),
  );

  sqlLines.push('-- SECTION 9: Shop-specific service categories');
  sqlLines.push(
    ...batchInsert(shopCategoryRows, 'service_categories', ['id', 'name', 'slug', 'description', 'icon_url', 'store_id', 'parent_id', 'created_at', 'updated_at'], {
      suffix: 'ON DUPLICATE KEY UPDATE `description` = VALUES(`description`), `parent_id` = VALUES(`parent_id`), `updated_at` = NOW();',
    }),
  );

  sqlLines.push('-- SECTION 10: Services');
  sqlLines.push(
    ...batchInsert(serviceRows, 'services', ['id', 'store_id', 'category_id', 'name', 'slug', 'description', 'image_urls', 'status', 'avg_rating', 'created_at', 'updated_at'], {
      batchSize: 25,
      suffix:
        'ON DUPLICATE KEY UPDATE `category_id` = VALUES(`category_id`), `name` = VALUES(`name`), `description` = VALUES(`description`), `image_urls` = VALUES(`image_urls`), `status` = VALUES(`status`), `avg_rating` = VALUES(`avg_rating`), `updated_at` = NOW();',
    }),
  );

  sqlLines.push('-- SECTION 11: Service variants');
  sqlLines.push(
    ...batchInsert(variantRows, 'service_variants', ['id', 'service_id', 'name', 'description', 'duration', 'price', 'cost_price', 'sort_order', 'status', 'created_at', 'updated_at'], {
      batchSize: 150,
    }),
  );

  sqlLines.push('-- SECTION 12: Staff-service assignments');
  sqlLines.push(
    ...batchInsert(staffServiceRows, 'staff_services', ['staff_id', 'service_id'], {
      batchSize: 400,
      suffix: 'ON DUPLICATE KEY UPDATE `staff_id` = `staff_id`;',
    }),
  );

  sqlLines.push('COMMIT;');
  sqlLines.push('');

  const stats = {
    owners: ownerUserRows.length,
    staffUsers: staffUserRows.length,
    stores: storeRows.length,
    workingHours: workingHourRows.length,
    ownerRoles: ownerRoleRows.length,
    staffProfiles: staffRows.length,
    staffRoles: staffRoleRows.length,
    schedules: scheduleRows.length,
    shopCategories: shopCategoryRows.length,
    services: serviceRows.length,
    variants: variantRows.length,
    staffServices: staffServiceRows.length,
  };

  return {
    sql: sqlLines.join('\n'),
    accounts: accounts.join('\n') + '\n',
    stats,
  };
}

function main() {
  const result = render();
  fs.writeFileSync(OUTPUT_SQL, result.sql, 'utf8');
  fs.writeFileSync(OUTPUT_ACCOUNTS, result.accounts, 'utf8');

  console.log('Generated 200-store demo seed');
  for (const [key, value] of Object.entries(result.stats)) {
    console.log(`${key}: ${value}`);
  }
  console.log(`Output: ${OUTPUT_SQL}`);
  console.log(`Accounts: ${OUTPUT_ACCOUNTS}`);
}

main();
