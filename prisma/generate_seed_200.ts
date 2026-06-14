import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_SQL = path.join(__dirname, 'seed_200_stores.sql');
const OUTPUT_ACCOUNTS = path.join(__dirname, 'seed_200_accounts.md');
const PASSWORD_HASH = '$2b$10$4rNY01kLNBZFcBWQuq.Rsu5P9g490SvP0fZ6PoftwySYtMQTKw/Dq';
const DEMO_STORE_COUNT = 60;
const MIN_SERVICES_PER_STORE = 20;
const MAX_SERVICES_PER_STORE = 30;
const MIN_CATEGORIES_PER_STORE = 2;
const MAX_CATEGORIES_PER_STORE = 5;
const MIN_IMAGES_PER_SERVICE = 1;
const MAX_IMAGES_PER_SERVICE = 3;
const MIN_VARIANTS_PER_SERVICE = 1;
const MAX_VARIANTS_PER_SERVICE = 3;
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

function sql(value: string | number | boolean | null): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function money(value: number): string {
  return `${value.toFixed(2)}`;
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
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
  'An Nhiên',
  'Lumina',
  'Mộc An',
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
  'Rosé',
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
    label: 'Spa nghỉ dưỡng',
    count: 9,
    suffixes: ['Spa', 'Wellness Spa', 'Day Spa', 'Luxury Spa'],
    categorySlugs: ['spa-massage', 'cham-soc-da-mat', 'xong-hoi-tam-trang', 'cham-soc-co-the'],
    staffSpecialties: ['Massage trị liệu', 'Chăm sóc body', 'Facial thư giãn', 'Xông hơi thảo mộc'],
    imageUrl: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'nail',
    label: 'Nail & beauty salon',
    count: 8,
    suffixes: ['Nail Studio', 'Beauty Bar', 'Nail & Spa', 'Nail Lounge'],
    categorySlugs: ['nail-mong-tay', 'long-may-mi-mat', 'triet-long'],
    staffSpecialties: ['Gel nail', 'Nail art', 'Pedicure', 'Waxing'],
    imageUrl: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'hair',
    label: 'Hair salon nữ',
    count: 8,
    suffixes: ['Hair Salon', 'Hair Studio', 'Beauty Salon', 'Tóc & Làm Đẹp'],
    categorySlugs: ['toc-nu', 'cham-soc-da-mat', 'trang-diem'],
    staffSpecialties: ['Cắt tạo kiểu', 'Nhuộm màu', 'Uốn duỗi', 'Phục hồi tóc'],
    imageUrl: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'barber',
    label: 'Barber store',
    count: 6,
    suffixes: ['Barbershop', "Men's Grooming", 'Classic Barber', 'Barber & Spa'],
    categorySlugs: ['cat-toc-barber', 'spa-massage'],
    staffSpecialties: ['Cắt tóc nam', 'Cạo râu', 'Fade & pompadour', 'Gội đầu thảo mộc'],
    imageUrl: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'skin',
    label: 'Skincare clinic',
    count: 8,
    suffixes: ['Skin Clinic', 'Beauty Clinic', 'Skincare Studio', 'Derma Spa'],
    categorySlugs: ['cham-soc-da-mat', 'tham-my-vien', 'triet-long'],
    staffSpecialties: ['Facial chuyên sâu', 'Trị mụn', 'Peel da', 'Laser toning'],
    imageUrl: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'yoga',
    label: 'Yoga & wellness studio',
    count: 4,
    suffixes: ['Yoga Studio', 'Wellness Center', 'Yoga & Pilates', 'Mind & Body'],
    categorySlugs: ['yoga-thien', 'fitness-pt', 'cham-soc-suc-khoe'],
    staffSpecialties: ['Hatha yoga', 'Pilates', 'Breathwork', 'PT cá nhân'],
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'aesthetic',
    label: 'Thẩm mỹ viện',
    count: 6,
    suffixes: ['Beauty Center', 'Aesthetic Clinic', 'Beauty Lab', 'Thẩm Mỹ Viện'],
    categorySlugs: ['tham-my-vien', 'triet-long', 'cham-soc-co-the', 'cham-soc-da-mat'],
    staffSpecialties: ['HIFU nâng cơ', 'RF trẻ hóa', 'Laser thâm nám', 'Giảm béo công nghệ'],
    imageUrl: 'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'lash',
    label: 'Eyelash & brow studio',
    count: 4,
    suffixes: ['Lash Studio', 'Brow & Lash', 'Eye Beauty', 'Lash Lounge'],
    categorySlugs: ['long-may-mi-mat', 'trang-diem'],
    staffSpecialties: ['Nối mi classic', 'Volume lash', 'Lift mi', 'Tạo dáng lông mày'],
    imageUrl: 'https://images.unsplash.com/photo-1589710751893-f9a6770ad71b?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'pmu',
    label: 'Phun xăm PMU',
    count: 4,
    suffixes: ['PMU Studio', 'Phun Xăm Studio', 'Xăm Thẩm Mỹ', 'Beauty Art'],
    categorySlugs: ['phun-xam-tham-my', 'long-may-mi-mat'],
    staffSpecialties: ['Phun môi', 'Microblading', 'Powder brow', 'Phun mí'],
    imageUrl: 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=1200&q=80',
  },
  {
    key: 'body',
    label: 'Body care & tắm trắng',
    count: 3,
    suffixes: ['Body Studio', 'Tắm Trắng & Spa', 'Body Lounge', 'Care House'],
    categorySlugs: ['xong-hoi-tam-trang', 'cham-soc-co-the', 'spa-massage'],
    staffSpecialties: ['Tắm trắng', 'Body scrub', 'Ủ body', 'Massage thư giãn'],
    imageUrl: 'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=1200&q=80',
  },
];

const CITIES: CityPlan[] = [
  {
    provinceId: 29,
    label: 'Hồ Chí Minh',
    count: 15,
    wards: [
      71701001, 71701002, 71701003, 71701004, 71703005, 71703006, 71709007, 71703008, 71709009,
      71709010, 71709011, 71709012, 71705013, 71705014, 71705015, 71705016, 71705017, 71705018,
      71707019, 71707020,
    ],
    lat: [10.72, 10.86],
    lng: [106.62, 106.78],
    districts: ['Quận 1', 'Quận 3', 'Bình Thạnh', 'Phú Nhuận', 'Tân Bình', 'Thủ Đức'],
  },
  {
    provinceId: 1,
    label: 'Hà Nội',
    count: 15,
    wards: [
      10105001, 10105002, 10101003, 10101004, 10101005, 10107006, 10107007, 10107008, 10109009,
      10109010, 10109011, 10109012, 10113025, 10113026, 10113027, 10103028, 10111022, 10111023,
      10127043, 10127044, 10106039, 10106040,
    ],
    lat: [20.98, 21.08],
    lng: [105.78, 105.88],
    districts: ['Hoàn Kiếm', 'Ba Đình', 'Đống Đa', 'Cầu Giấy', 'Tây Hồ', 'Hà Đông'],
  },
  {
    provinceId: 21,
    label: 'Đà Nẵng',
    count: 8,
    wards: [
      50101001, 50101002, 50103003, 50115004, 50105005, 50105006, 50107007, 50109008, 50109009,
      50109010, 50115011, 50111012,
    ],
    lat: [15.99, 16.10],
    lng: [108.17, 108.28],
    districts: ['Hải Châu', 'Thanh Khê', 'Sơn Trà', 'Ngũ Hành Sơn', 'Liên Chiểu'],
  },
  {
    provinceId: 33,
    label: 'Cần Thơ',
    count: 6,
    wards: [81519001, 81519002, 81519003, 81519004, 81521005, 81521006, 81523008, 81523009],
    lat: [10.00, 10.08],
    lng: [105.72, 105.82],
    districts: ['Ninh Kiều', 'Bình Thủy', 'Cái Răng', 'Ô Môn'],
  },
  {
    provinceId: 20,
    label: 'Huế',
    count: 4,
    wards: [41109001, 41119002, 41109003, 41101004, 41101005, 41101006, 41101007],
    lat: [16.42, 16.50],
    lng: [107.55, 107.65],
    districts: ['Thuận Hóa', 'Phú Xuân', 'Hương Thủy'],
  },
  {
    provinceId: 23,
    label: 'Khánh Hòa',
    count: 4,
    wards: [51101001, 51101002, 51101003, 51101004, 51109005, 51109006, 51109007],
    lat: [12.20, 12.30],
    lng: [109.15, 109.25],
    districts: ['Nha Trang', 'Cam Ranh', 'Diên Khánh'],
  },
  {
    provinceId: 28,
    label: 'Đồng Nai',
    count: 3,
    wards: [71301001, 71301002, 71301003, 71301004, 71301005, 71301006],
    lat: [10.90, 11.02],
    lng: [106.78, 106.92],
    districts: ['Biên Hòa', 'Long Khánh', 'Trảng Bom'],
  },
  {
    provinceId: 4,
    label: 'Hải Phòng',
    count: 2,
    wards: [10301008, 10301009, 10303010, 10303011, 10305012, 10305013],
    lat: [20.82, 20.90],
    lng: [106.65, 106.75],
    districts: ['Hồng Bàng', 'Ngô Quyền', 'Lê Chân'],
  },
  {
    provinceId: 3,
    label: 'Quảng Ninh',
    count: 1,
    wards: [22501015, 22501017, 22501021, 22501022, 22503028],
    lat: [20.93, 21.02],
    lng: [107.05, 107.16],
    districts: ['Hạ Long', 'Cẩm Phả', 'Uông Bí'],
  },
  {
    provinceId: 26,
    label: 'Lâm Đồng',
    count: 1,
    wards: [70301001, 70301002, 70301003, 70301004, 70305005],
    lat: [11.90, 11.98],
    lng: [108.40, 108.48],
    districts: ['Đà Lạt', 'Bảo Lộc', 'Đức Trọng'],
  },
  {
    provinceId: 2,
    label: 'Bắc Ninh',
    count: 1,
    wards: [22113001, 22113002, 22113003, 22113004],
    lat: [21.15, 21.22],
    lng: [106.02, 106.10],
    districts: ['Bắc Ninh', 'Từ Sơn', 'Quế Võ'],
  },
];

const SHOP_CATEGORIES: Record<StoreKindKey, ShopCategoryTemplate[]> = {
  spa: [
    { key: 'massage-tri-lieu', name: 'Massage trị liệu', parentSlug: 'spa-massage', description: 'Massage body, đá nóng, tinh dầu và phục hồi cổ vai gáy.' },
    { key: 'facial-spa', name: 'Chăm sóc da mặt', parentSlug: 'cham-soc-da-mat', description: 'Facial làm sạch, cấp ẩm, trẻ hóa và làm sáng da.' },
    { key: 'tam-trang-xong-hoi', name: 'Tắm trắng và xông hơi', parentSlug: 'xong-hoi-tam-trang', description: 'Xông hơi thảo mộc, tắm trắng và ngâm thư giãn.' },
    { key: 'body-care', name: 'Chăm sóc cơ thể', parentSlug: 'cham-soc-co-the', description: 'Body scrub, ủ dưỡng và wrap thảo mộc.' },
    { key: 'goi-dau', name: 'Gội đầu dưỡng sinh', parentSlug: 'spa-massage', description: 'Chăm sóc da đầu, cổ vai gáy và thảo mộc.' },
  ],
  nail: [
    { key: 'nail-gel', name: 'Nail gel và sơn móng', parentSlug: 'nail-mong-tay', description: 'Sơn gel, gel builder và chăm sóc móng.' },
    { key: 'nail-art', name: 'Nail art và đắp bột', parentSlug: 'nail-mong-tay', description: 'Vẽ nghệ thuật, charm, ombre và đắp bột.' },
    { key: 'pedicure', name: 'Pedicure và foot care', parentSlug: 'nail-mong-tay', description: 'Chăm sóc chân, gót chân và sơn móng chân.' },
    { key: 'waxing', name: 'Waxing dịu nhẹ', parentSlug: 'triet-long', description: 'Waxing mặt, tay, chân và vùng nhỏ.' },
    { key: 'lash-brow', name: 'Mi và chân mày', parentSlug: 'long-may-mi-mat', description: 'Nối mi, lift mi và tạo dáng chân mày.' },
  ],
  hair: [
    { key: 'cat-tao-kieu', name: 'Cắt và tạo kiểu', parentSlug: 'toc-nu', description: 'Cắt tóc nữ, tạo kiểu, gội sấy và tư vấn form tóc.' },
    { key: 'nhuom-toc', name: 'Nhuộm và highlight', parentSlug: 'toc-nu', description: 'Nhuộm thời trang, highlight, balayage và phủ bạc.' },
    { key: 'uon-duoi', name: 'Uốn duỗi ép tóc', parentSlug: 'toc-nu', description: 'Uốn setting, duỗi collagen và ép phục hồi.' },
    { key: 'phuc-hoi-toc', name: 'Phục hồi tóc', parentSlug: 'toc-nu', description: 'Keratin, olaplex, protein và hấp dầu cao cấp.' },
    { key: 'makeup', name: 'Makeup và styling', parentSlug: 'trang-diem', description: 'Makeup dự tiệc, chụp ảnh và styling tóc.' },
  ],
  barber: [
    { key: 'cat-toc-nam', name: 'Cắt tóc nam', parentSlug: 'cat-toc-barber', description: 'Fade, undercut, pompadour và classic cut.' },
    { key: 'beard-care', name: 'Cạo râu và chăm sóc beard', parentSlug: 'cat-toc-barber', description: 'Cạo râu nóng, tạo kiểu beard và dưỡng da.' },
    { key: 'goi-dau-nam', name: 'Gội đầu nam', parentSlug: 'spa-massage', description: 'Gội đầu thảo mộc, massage cổ vai gáy cho nam.' },
    { key: 'combo-grooming', name: 'Combo grooming', parentSlug: 'cat-toc-barber', description: 'Combo cắt, cạo râu, gội đầu và styling.' },
    { key: 'massage-nam', name: 'Massage thư giãn', parentSlug: 'spa-massage', description: 'Massage đầu, vai gáy và tay cho khách nam.' },
  ],
  skin: [
    { key: 'facial-basic', name: 'Facial và cấp ẩm', parentSlug: 'cham-soc-da-mat', description: 'Làm sạch sâu, cấp ẩm, điện di tinh chất và mặt nạ.' },
    { key: 'tri-mun', name: 'Điều trị mụn và thâm', parentSlug: 'cham-soc-da-mat', description: 'Lấy nhân mụn, giảm thâm, kiểm soát dầu và phục hồi.' },
    { key: 'peel-da', name: 'Peel da hóa học', parentSlug: 'cham-soc-da-mat', description: 'AHA, BHA, enzyme peel và retinol peel.' },
    { key: 'laser-skin', name: 'Laser và trẻ hóa', parentSlug: 'tham-my-vien', description: 'Laser toning, RF, collagen và trẻ hóa da.' },
    { key: 'triet-long', name: 'Triệt lông laser', parentSlug: 'triet-long', description: 'Triệt lông diode, IPL và chăm sóc sau laser.' },
  ],
  yoga: [
    { key: 'yoga-basic', name: 'Yoga cơ bản và nâng cao', parentSlug: 'yoga-thien', description: 'Hatha, Vinyasa, Yin và yoga cân bằng.' },
    { key: 'pilates', name: 'Pilates và core', parentSlug: 'fitness-pt', description: 'Mat pilates, reformer, core và mobility.' },
    { key: 'breathwork', name: 'Thiền và breathwork', parentSlug: 'yoga-thien', description: 'Mindfulness, thiền định và kỹ thuật thở.' },
    { key: 'personal-training', name: 'Personal training', parentSlug: 'fitness-pt', description: 'PT cá nhân, theo dõi chỉ số và kế hoạch tập.' },
    { key: 'yoga-tri-lieu', name: 'Yoga trị liệu', parentSlug: 'yoga-thien', description: 'Yoga phục hồi, đau lưng, prenatal và senior.' },
  ],
  aesthetic: [
    { key: 'nang-co', name: 'Nâng cơ và căng da', parentSlug: 'tham-my-vien', description: 'HIFU, RF, thread lift và nâng cơ không phẫu thuật.' },
    { key: 'dieu-khac-face', name: 'Điêu khắc khuôn mặt', parentSlug: 'tham-my-vien', description: 'Filler, botox, V-line và tư vấn tỷ lệ mặt.' },
    { key: 'tre-hoa-cn', name: 'Trẻ hóa công nghệ cao', parentSlug: 'tham-my-vien', description: 'PRP, laser CO2, Thermage và Ultherapy.' },
    { key: 'triet-long-laser', name: 'Triệt lông laser', parentSlug: 'triet-long', description: 'Laser diode, IPL và triệt lông toàn thân.' },
    { key: 'giam-beo', name: 'Giảm béo và định hình', parentSlug: 'cham-soc-co-the', description: 'Cavitation, EMS, tan mỡ và tạo đường cong.' },
    { key: 'tham-nam', name: 'Điều trị thâm nám', parentSlug: 'cham-soc-da-mat', description: 'Laser nám, IPL, pico và chăm sóc phục hồi.' },
  ],
  lash: [
    { key: 'lash-extension', name: 'Nối mi classic và volume', parentSlug: 'long-may-mi-mat', description: 'Classic, hybrid, volume 2D-6D và mega volume.' },
    { key: 'lash-lift', name: 'Lift mi và uốn mi', parentSlug: 'long-may-mi-mat', description: 'Lift mi keratin, uốn mi và nhuộm mi.' },
    { key: 'brow-shaping', name: 'Tạo dáng lông mày', parentSlug: 'long-may-mi-mat', description: 'Wax, thread, tint và brow lamination.' },
    { key: 'lash-care', name: 'Chăm sóc mi tự nhiên', parentSlug: 'long-may-mi-mat', description: 'Dưỡng mi, serum mi và tháo mi an toàn.' },
    { key: 'eye-combo', name: 'Combo mắt', parentSlug: 'long-may-mi-mat', description: 'Combo mi, lông mày và makeup mắt.' },
  ],
  pmu: [
    { key: 'phun-moi', name: 'Phun môi thẩm mỹ', parentSlug: 'phun-xam-tham-my', description: 'Lip blush, ombre, khử thâm nhẹ và phủ bóng môi.' },
    { key: 'phun-may', name: 'Phun và điêu khắc chân mày', parentSlug: 'phun-xam-tham-my', description: 'Microblading, powder brow và ombre brow.' },
    { key: 'phun-mi', name: 'Phun mí mắt', parentSlug: 'phun-xam-tham-my', description: 'Eyeliner PMU, phun mí trên dưới và chăm sóc sau phun.' },
    { key: 'sau-phun', name: 'Chăm sóc sau phun', parentSlug: 'phun-xam-tham-my', description: 'Tái khám, bổ sung màu và phục hồi sau phun.' },
    { key: 'pmu-combo', name: 'Combo phun xăm', parentSlug: 'phun-xam-tham-my', description: 'Gói môi, mày, mí và chăm sóc trọn gói.' },
  ],
  body: [
    { key: 'tam-trang', name: 'Tắm trắng toàn thân', parentSlug: 'xong-hoi-tam-trang', description: 'Tắm trắng sữa dê, glutathione, carbon và khoáng.' },
    { key: 'body-scrub', name: 'Body scrub', parentSlug: 'cham-soc-co-the', description: 'Scrub muối, cà phê, dưỡng và thảo mộc.' },
    { key: 'u-body', name: 'Ủ body và mặt nạ cơ thể', parentSlug: 'cham-soc-co-the', description: 'Ủ collagen, wrap dưỡng ẩm và tinh chất.' },
    { key: 'xong-hoi', name: 'Xông hơi và ngâm tắm', parentSlug: 'xong-hoi-tam-trang', description: 'Xông hơi khô, ướt, ngâm thảo dược và onsen.' },
    { key: 'massage-body', name: 'Massage thư giãn', parentSlug: 'spa-massage', description: 'Massage cơ bản kết hợp body care.' },
  ],
};

const SERVICE_TEMPLATES: Record<StoreKindKey, ServiceTemplate[]> = {
  spa: [
    service('Massage đá nóng', 'massage-da-nong', 'massage-tri-lieu', 'massage đá nóng và thảo mộc', [350000, 560000, 820000], [60, 90, 120]),
    service('Massage body tinh dầu', 'massage-body-tinh-dau', 'massage-tri-lieu', 'massage toàn thân với tinh dầu dịu nhẹ', [280000, 480000, 720000], [60, 90, 120]),
    service('Massage cổ vai gáy', 'massage-co-vai-gay', 'massage-tri-lieu', 'giảm căng cơ cổ vai gáy và lưng trên', [220000, 360000, 540000], [45, 60, 90]),
    service('Facial cấp ẩm phục hồi', 'facial-cap-am-phuc-hoi', 'facial-spa', 'làm sạch và cấp ẩm da mặt', [320000, 520000, 780000], [60, 75, 90]),
    service('Tắm trắng thảo mộc', 'tam-trang-thao-moc', 'tam-trang-xong-hoi', 'tắm trắng và ủ body thảo mộc', [420000, 650000, 940000], [75, 100, 130]),
    service('Xông hơi detox', 'xong-hoi-detox', 'tam-trang-xong-hoi', 'xông hơi và ngâm chân thanh lọc', [180000, 320000, 520000], [30, 45, 60]),
    service('Body scrub muối khoáng', 'body-scrub-muoi-khoang', 'body-care', 'tẩy tế bào chết và ủ dưỡng body', [260000, 430000, 680000], [45, 75, 100]),
    service('Gội đầu dưỡng sinh', 'goi-dau-duong-sinh', 'goi-dau', 'gội đầu thảo mộc và massage đầu', [180000, 290000, 450000], [45, 60, 90]),
  ],
  nail: [
    service('Sơn gel Hàn Quốc', 'son-gel-han-quoc', 'nail-gel', 'sơn gel bóng bền và chăm sóc móng', [150000, 260000, 420000], [45, 60, 90]),
    service('Đắp gel builder', 'dap-gel-builder', 'nail-gel', 'đắp gel tạo form móng tự nhiên', [280000, 420000, 620000], [75, 100, 130]),
    service('Nail art charm', 'nail-art-charm', 'nail-art', 'vẽ móng nghệ thuật và gắn charm', [220000, 380000, 580000], [75, 105, 135]),
    service('Pedicure spa', 'pedicure-spa', 'pedicure', 'chăm sóc chân và gót chân', [180000, 300000, 480000], [45, 75, 100]),
    service('Waxing vùng nhỏ', 'waxing-vung-nho', 'waxing', 'waxing dịu nhẹ cho mặt và cơ thể', [120000, 220000, 360000], [30, 45, 60]),
    service('Nối mi tự nhiên', 'noi-mi-tu-nhien', 'lash-brow', 'nối mi classic nhẹ mắt', [220000, 400000, 650000], [75, 100, 130]),
  ],
  hair: [
    service('Cắt tạo kiểu nữ', 'cat-tao-kieu-nu', 'cat-tao-kieu', 'cắt tóc và tư vấn form mặt', [120000, 240000, 420000], [45, 60, 90]),
    service('Nhuộm phủ bạc', 'nhuom-phu-bac', 'nhuom-toc', 'nhuộm phủ bạc và chăm sóc tóc', [350000, 620000, 980000], [120, 150, 180]),
    service('Balayage thời trang', 'balayage-thoi-trang', 'nhuom-toc', 'nhuộm balayage và highlight', [800000, 1400000, 2200000], [180, 240, 300]),
    service('Uốn setting', 'uon-setting', 'uon-duoi', 'uốn tạo nếp và chăm sóc sau hóa chất', [580000, 900000, 1400000], [150, 210, 270]),
    service('Duỗi collagen', 'duoi-collagen', 'uon-duoi', 'duỗi tóc mềm và giảm xơ', [520000, 860000, 1320000], [150, 210, 270]),
    service('Phục hồi keratin', 'phuc-hoi-keratin', 'phuc-hoi-toc', 'hấp phục hồi và bổ sung keratin', [380000, 680000, 1050000], [90, 120, 150]),
    service('Makeup dự tiệc', 'makeup-du-tiec', 'makeup', 'makeup và styling tóc dự tiệc', [450000, 750000, 1200000], [90, 120, 150]),
  ],
  barber: [
    service('Classic haircut', 'classic-haircut', 'cat-toc-nam', 'cắt tóc nam cổ điển và gội sấy', [100000, 180000, 280000], [30, 45, 60]),
    service('Fade cut', 'fade-cut', 'cat-toc-nam', 'fade, taper và tạo kiểu hiện đại', [150000, 260000, 420000], [45, 60, 75]),
    service('Cạo râu nóng', 'cao-rau-nong', 'beard-care', 'cạo râu khăn nóng và dưỡng da', [90000, 160000, 260000], [30, 45, 60]),
    service('Beard styling', 'beard-styling', 'beard-care', 'tạo kiểu râu và dưỡng beard oil', [120000, 220000, 340000], [30, 45, 60]),
    service('Gội đầu thảo mộc nam', 'goi-dau-thao-moc-nam', 'goi-dau-nam', 'gội đầu và massage cổ vai gáy', [140000, 240000, 360000], [45, 60, 75]),
    service('Combo gentleman', 'combo-gentleman', 'combo-grooming', 'cắt tóc, cạo râu, gội đầu và styling', [260000, 420000, 650000], [75, 100, 130]),
  ],
  skin: [
    service('Facial làm sạch sâu', 'facial-lam-sach-sau', 'facial-basic', 'làm sạch sâu và cấp ẩm', [280000, 480000, 760000], [60, 75, 90]),
    service('Trị mụn chuyên sâu', 'tri-mun-chuyen-sau', 'tri-mun', 'lấy nhân mụn và giảm viêm', [350000, 620000, 980000], [75, 100, 130]),
    service('Giảm thâm sau mụn', 'giam-tham-sau-mun', 'tri-mun', 'serum phục hồi và làm sáng', [420000, 720000, 1100000], [75, 100, 130]),
    service('Peel AHA BHA', 'peel-aha-bha', 'peel-da', 'peel da và phục hồi hàng rào da', [500000, 850000, 1300000], [60, 90, 120]),
    service('Laser toning', 'laser-toning', 'laser-skin', 'laser làm sáng và đều màu da', [850000, 1500000, 2400000], [60, 90, 120]),
    service('Triệt lông diode', 'triet-long-diode', 'triet-long', 'triệt lông bằng công nghệ diode', [300000, 650000, 1200000], [45, 75, 100]),
  ],
  yoga: [
    service('Hatha yoga', 'hatha-yoga', 'yoga-basic', 'lớp yoga nền tảng và cân bằng', [150000, 350000, 850000], [60, 75, 90]),
    service('Vinyasa flow', 'vinyasa-flow', 'yoga-basic', 'chuỗi động tác liên tục và linh hoạt', [180000, 420000, 950000], [60, 75, 90]),
    service('Reformer pilates', 'reformer-pilates', 'pilates', 'pilates với máy reformer', [280000, 650000, 1400000], [50, 60, 75]),
    service('Breathwork session', 'breathwork-session', 'breathwork', 'kỹ thuật thở và thiền định', [180000, 360000, 780000], [45, 60, 90]),
    service('PT cá nhân', 'pt-ca-nhan', 'personal-training', 'huấn luyện cá nhân theo mục tiêu', [350000, 750000, 1600000], [60, 90, 120]),
    service('Yoga trị liệu đau lưng', 'yoga-tri-lieu-dau-lung', 'yoga-tri-lieu', 'yoga phục hồi cho lưng và cột sống', [220000, 480000, 980000], [60, 75, 90]),
  ],
  aesthetic: [
    service('HIFU nâng cơ', 'hifu-nang-co', 'nang-co', 'nâng cơ không phẫu thuật', [1200000, 2600000, 5200000], [60, 90, 120]),
    service('RF trẻ hóa da', 'rf-tre-hoa-da', 'tre-hoa-cn', 'sóng RF kích thích collagen', [850000, 1600000, 3000000], [60, 90, 120]),
    service('Filler tạo hình', 'filler-tao-hinh', 'dieu-khac-face', 'tư vấn và tạo hình đường nét', [1800000, 3600000, 6800000], [45, 75, 100]),
    service('Laser trị nám', 'laser-tri-nam', 'tham-nam', 'laser pico và phục hồi da', [950000, 1900000, 3600000], [60, 90, 120]),
    service('Giảm béo cavitation', 'giam-beo-cavitation', 'giam-beo', 'tan mỡ và định hình cơ thể', [650000, 1300000, 2500000], [75, 100, 130]),
    service('Triệt lông toàn thân', 'triet-long-toan-than', 'triet-long-laser', 'triệt lông laser nhiều vùng', [900000, 1800000, 3200000], [90, 120, 150]),
  ],
  lash: [
    service('Nối mi classic', 'noi-mi-classic', 'lash-extension', 'nối mi 1:1 tự nhiên', [220000, 380000, 620000], [75, 100, 130]),
    service('Nối mi volume', 'noi-mi-volume', 'lash-extension', 'volume 3D-6D mềm nhẹ', [360000, 560000, 850000], [100, 130, 160]),
    service('Lift mi keratin', 'lift-mi-keratin', 'lash-lift', 'lift mi và dưỡng keratin', [260000, 420000, 620000], [60, 75, 90]),
    service('Brow lamination', 'brow-lamination', 'brow-shaping', 'định hình và lamination lông mày', [300000, 480000, 720000], [60, 75, 90]),
    service('Tháo mi an toàn', 'thao-mi-an-toan', 'lash-care', 'tháo mi và chăm sóc mi thật', [120000, 220000, 340000], [30, 45, 60]),
    service('Combo lash brow', 'combo-lash-brow', 'eye-combo', 'nối mi và tạo dáng lông mày', [520000, 760000, 1100000], [120, 150, 180]),
  ],
  pmu: [
    service('Phun môi lip blush', 'phun-moi-lip-blush', 'phun-moi', 'phun môi trong trẻo và đều màu', [1800000, 3200000, 5200000], [120, 150, 180]),
    service('Phun môi khử thâm', 'phun-moi-khu-tham', 'phun-moi', 'xử lý nền môi thâm và phun màu', [2200000, 3800000, 6000000], [150, 180, 210]),
    service('Microblading chân mày', 'microblading-chan-may', 'phun-may', 'điêu khắc sợi mày tự nhiên', [2000000, 3600000, 5800000], [120, 150, 180]),
    service('Powder brow', 'powder-brow', 'phun-may', 'phun mày hạt bột mềm mịn', [1800000, 3200000, 5200000], [120, 150, 180]),
    service('Phun mí eyeliner', 'phun-mi-eyeliner', 'phun-mi', 'phun mí sát chân mi tự nhiên', [1500000, 2600000, 4200000], [90, 120, 150]),
    service('Tái khám bổ sung màu', 'tai-kham-bo-sung-mau', 'sau-phun', 'kiểm tra và bổ sung màu sau bong', [400000, 800000, 1400000], [60, 90, 120]),
  ],
  body: [
    service('Tắm trắng sữa dê', 'tam-trang-sua-de', 'tam-trang', 'tắm trắng và dưỡng ẩm toàn thân', [420000, 680000, 980000], [75, 100, 130]),
    service('Tắm trắng carbon', 'tam-trang-carbon', 'tam-trang', 'làm sáng da với carbon và khoáng', [520000, 850000, 1250000], [90, 120, 150]),
    service('Body scrub cà phê', 'body-scrub-ca-phe', 'body-scrub', 'tẩy tế bào chết và làm mịn da', [260000, 420000, 620000], [45, 75, 100]),
    service('Ủ body collagen', 'u-body-collagen', 'u-body', 'ủ dưỡng collagen và cấp ẩm sâu', [360000, 580000, 860000], [60, 90, 120]),
    service('Xông hơi onsen', 'xong-hoi-onsen', 'xong-hoi', 'xông hơi và ngâm tắm thư giãn', [280000, 460000, 760000], [60, 90, 120]),
    service('Massage body cơ bản', 'massage-body-co-ban', 'massage-body', 'massage thư giãn kết hợp body care', [260000, 450000, 700000], [60, 90, 120]),
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

const SERVICE_IMAGE_POOLS = {
  massage: [
    '1741522509438-a120c0bb5e88',
    '1519823551278-64ac92734fb1',
    '1515377905703-c4788e51af15',
    '1639162906614-0603b0ae95fd',
    '1600334089648-b0d9d3028eb2',
  ],
  skin: [
    '1581182800629-7d90925ad072',
    '1573461160327-b450ce3d8e7f',
    '1555820585-c5ae44394b79',
    '1609542334025-778f9093a234',
    '1723540634462-528708cc17aa',
  ],
  nail: [
    '1604654894610-df63bc536371',
    '1632345031435-8727f6897d53',
    '1610992015762-45dca7fa3a85',
    '1607779097040-26e80aa78e66',
    '1619607146034-5a05296c8f9a',
  ],
  haircut: [
    '1605497788044-5a32c7078486',
    '1503951914875-452162b0f3f1',
    '1647140655214-e4a2d914971f',
    '1599351431202-1e0f0137899a',
    '1621605815971-fbc98d665033',
  ],
  facial: [
    '1643684391140-c5056cfd3436',
    '1616394584738-fc6e612e71b9',
    '1570172619644-dfd03ed5d881',
    '1731514771613-991a02407132',
    '1730288951113-9cc087c14b83',
  ],
  botox: [
    '1713085085470-fba013d67e65',
    '1598300188904-6287d52746ad',
    '1544717304-a2db4a7b16ee',
    '1737215398603-2ef701df8036',
    '1623682687826-fe06bf64e6d8',
  ],
  microblading: [
    '1585885970325-81cba4494c27',
    '1567629307995-b9f33097bd30',
    '1674049406179-d7bf2c263e71',
    '1651839633408-3fccd671b832',
    '1735151225764-eac694642dbf',
  ],
  eyeliner: [
    '1622336889416-8d790ad807d7',
    '1595550912256-b24059bb08e8',
    '1631214524020-7e18db9a8f92',
    '1487412947147-5cebf100ffc2',
    '1631237535134-e009a5939d9c',
  ],
  lipBlush: [
    '1631214499500-2e34edcaccfe',
    '1625093742435-6fa192b6fb10',
    '1654374504608-67c4cfe65fca',
    '1643630661247-2474f10e4f70',
    '1654375078795-7229b6458d25',
  ],
  hairRemoval: [
    '1700760933574-9f0f4ea9aa3b',
    '1700760934166-4c766d708139',
    '1700760933941-3a06a28fbf47',
    '1720424643392-4b63bd63d271',
    '1467632499275-7a693a761056',
  ],
  bodyCare: [
    '1573461160327-b450ce3d8e7f',
    '1619451427882-6aaaded0cc61',
    '1599817878414-43ef36677cf0',
    '1544717304-a2db4a7b16ee',
    '1515377905703-c4788e51af15',
  ],
  bodyExfoliation: [
    '1654864471383-50ac3ed9b4f6',
    '1669979963553-c9b9e347f08a',
    '1598619254718-4cd63ec2d0f5',
    '1766241883878-b8262bbce8f8',
    '1778410238722-b691772411aa',
  ],
  hairTherapy: [
    '1564141696939-9eb6e957ccfc',
    '1634449571010-02389ed0f9b0',
    '1522337360788-8b13dee7a37e',
    '1560264641-1b5191cc63e2',
    '1580618672591-eb180b1a973f',
  ],
  hairColor: [
    '1554519934-e32b1629d9ee',
    '1522337360788-8b13dee7a37e',
    '1614020863825-28a0bb7e3c3c',
    '1707812343087-c9ff9e5abb43',
    '1602549179763-ce6c9df961b7',
  ],
  lashes: [
    '1589710751893-f9a6770ad71b',
    '1587910234573-d6fc84743bc8',
    '1612804327354-d29af30ac8a6',
    '1516220362602-dba5272034e7',
    '1735151226446-1d364b4adc2f',
  ],
  yoga: [
    '1544367567-0f2fcb009e0b',
    '1506126613408-eca07ce68773',
    '1599901860904-17e6ed7083a0',
    '1552196563-55cd4e45efb3',
    '1579454566790-f9e5697ddf36',
  ],
  pilates: [
    '1579454566790-f9e5697ddf36',
    '1747239069226-55382c570116',
    '1747238415033-b74eec07eb59',
    '1552196527-bffef41ef674',
    '1591258370814-01609b341790',
  ],
  barber: [
    '1605497788044-5a32c7078486',
    '1503951914875-452162b0f3f1',
    '1647140655214-e4a2d914971f',
    '1621605815971-fbc98d665033',
    '1599351431202-1e0f0137899a',
  ],
  spa: [
    '1741522509438-a120c0bb5e88',
    '1519823551278-64ac92734fb1',
    '1515377905703-c4788e51af15',
    '1544161515-4ab6ce6db874',
    '1591343395082-e120087004b4',
  ],
  hair: [
    '1564141696939-9eb6e957ccfc',
    '1522337360788-8b13dee7a37e',
    '1554519934-e32b1629d9ee',
    '1605497788044-5a32c7078486',
    '1560066984-138dadb4c035',
  ],
  aesthetic: [
    '1713085085470-fba013d67e65',
    '1598300188904-6287d52746ad',
    '1616394584738-fc6e612e71b9',
    '1570172619644-dfd03ed5d881',
    '1544717304-a2db4a7b16ee',
  ],
  lash: [
    '1589710751893-f9a6770ad71b',
    '1587910234573-d6fc84743bc8',
    '1612804327354-d29af30ac8a6',
    '1516220362602-dba5272034e7',
    '1735151226446-1d364b4adc2f',
  ],
  pmu: [
    '1631214499500-2e34edcaccfe',
    '1585885970325-81cba4494c27',
    '1622336889416-8d790ad807d7',
    '1567629307995-b9f33097bd30',
    '1516975080664-ed2fc6a32937',
  ],
  body: [
    '1573461160327-b450ce3d8e7f',
    '1619451427882-6aaaded0cc61',
    '1599817878414-43ef36677cf0',
    '1654864471383-50ac3ed9b4f6',
    '1519823551278-64ac92734fb1',
  ],
} as const;

type ServiceImagePoolKey = keyof typeof SERVICE_IMAGE_POOLS;

const SERVICE_IMAGE_POOL_BY_SLUG: Record<string, ServiceImagePoolKey> = {
  'massage-da-nong': 'massage',
  'massage-body-tinh-dau': 'massage',
  'massage-co-vai-gay': 'massage',
  'facial-cap-am-phuc-hoi': 'facial',
  'tam-trang-thao-moc': 'bodyCare',
  'xong-hoi-detox': 'bodyCare',
  'body-scrub-muoi-khoang': 'bodyExfoliation',
  'goi-dau-duong-sinh': 'hairTherapy',
  'son-gel-han-quoc': 'nail',
  'dap-gel-builder': 'nail',
  'nail-art-charm': 'nail',
  'pedicure-spa': 'nail',
  'waxing-vung-nho': 'hairRemoval',
  'noi-mi-tu-nhien': 'lashes',
  'cat-tao-kieu-nu': 'haircut',
  'nhuom-phu-bac': 'hairColor',
  'balayage-thoi-trang': 'hairColor',
  'uon-setting': 'hairTherapy',
  'duoi-collagen': 'hairTherapy',
  'phuc-hoi-keratin': 'hairTherapy',
  'makeup-du-tiec': 'lipBlush',
  'classic-haircut': 'barber',
  'fade-cut': 'barber',
  'cao-rau-nong': 'barber',
  'beard-styling': 'barber',
  'goi-dau-thao-moc-nam': 'barber',
  'combo-gentleman': 'barber',
  'facial-lam-sach-sau': 'facial',
  'tri-mun-chuyen-sau': 'skin',
  'giam-tham-sau-mun': 'skin',
  'peel-aha-bha': 'skin',
  'laser-toning': 'skin',
  'triet-long-diode': 'hairRemoval',
  'hatha-yoga': 'yoga',
  'vinyasa-flow': 'yoga',
  'reformer-pilates': 'pilates',
  'breathwork-session': 'yoga',
  'pt-ca-nhan': 'pilates',
  'yoga-tri-lieu-dau-lung': 'yoga',
  'hifu-nang-co': 'botox',
  'rf-tre-hoa-da': 'botox',
  'filler-tao-hinh': 'botox',
  'laser-tri-nam': 'skin',
  'giam-beo-cavitation': 'bodyCare',
  'triet-long-toan-than': 'hairRemoval',
  'noi-mi-classic': 'lashes',
  'noi-mi-volume': 'lashes',
  'lift-mi-keratin': 'lashes',
  'brow-lamination': 'microblading',
  'thao-mi-an-toan': 'lashes',
  'combo-lash-brow': 'lashes',
  'phun-moi-lip-blush': 'lipBlush',
  'phun-moi-khu-tham': 'lipBlush',
  'microblading-chan-may': 'microblading',
  'powder-brow': 'microblading',
  'phun-mi-eyeliner': 'eyeliner',
  'tai-kham-bo-sung-mau': 'microblading',
  'tam-trang-sua-de': 'bodyCare',
  'tam-trang-carbon': 'bodyCare',
  'body-scrub-ca-phe': 'bodyExfoliation',
  'u-body-collagen': 'bodyCare',
  'xong-hoi-onsen': 'bodyCare',
  'massage-body-co-ban': 'massage',
};

function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function selectStoreCategories(store: StoreSeed): ShopCategoryTemplate[] {
  const all = SHOP_CATEGORIES[store.kind.key];
  const rand = seededRand(store.index * 7331);
  const max = Math.min(MAX_CATEGORIES_PER_STORE, all.length);
  const min = Math.min(MIN_CATEGORIES_PER_STORE, max);
  const count = randInt(min, max, rand);
  return shuffled(all, rand).slice(0, count);
}

function buildServiceImageUrls(store: StoreSeed, serviceTemplate: ServiceTemplate, serviceIndex: number, rand: () => number): string[] {
  const count = randInt(MIN_IMAGES_PER_SERVICE, MAX_IMAGES_PER_SERVICE, rand);
  const poolKey = SERVICE_IMAGE_POOL_BY_SLUG[serviceTemplate.baseSlug] ?? store.kind.key;
  const photoIds = SERVICE_IMAGE_POOLS[poolKey] ?? SERVICE_IMAGE_POOLS.spa;
  const urls: string[] = [];

  for (let imageIndex = 0; imageIndex < count; imageIndex++) {
    const photoId = photoIds[(store.index + serviceIndex + imageIndex) % photoIds.length];
    const signature = store.index * 100000 + serviceIndex * 10 + imageIndex;
    urls.push(`https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=900&h=700&q=80&sig=${signature}`);
  }

  return urls;
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
  for (let index = 1; index <= DEMO_STORE_COUNT; index++) {
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
    `  <h1>${store.name} - Nơi chăm sóc và tái tạo năng lượng</h1>`,
    `  <h2>Về ${store.name}</h2>`,
    `  <p>${store.name} là một điểm đến demo thuộc nhóm ${store.kind.label} tại ${district}, ${store.city.label}. Không gian được mô tả theo hướng gần gũi, gọn gàng và tạo cảm giác tin cậy ngay từ lần đầu khách hàng xem thông tin. Cửa hàng phù hợp cho những người muốn tìm một nơi có quy trình rõ ràng, lịch hẹn linh hoạt, thông tin minh bạch và trải nghiệm ổn định. Địa chỉ demo tại ${address} giúp dữ liệu có ngữ cảnh địa phương khi kiểm thử bản đồ, bộ lọc khu vực, tìm kiếm theo thành phố và trang chi tiết của từng cơ sở.</p>`,
    '  <h2>Triết lý chăm sóc</h2>',
    `  <p>Điểm mạnh của ${store.name} nằm ở cách sắp xếp dịch vụ theo nhóm nhu cầu thay vì chỉ liệt kê tên gói. Khách hàng bắt đầu từ nhu cầu thư giãn, chăm sóc cá nhân, cải thiện ngoại hình, phục hồi thể trạng hoặc duy trì lịch chăm sóc định kỳ. Từng nhóm dịch vụ được mô tả để hệ thống có nội dung đầy đủ hơn khi hiển thị trên trang public, trong kết quả tìm kiếm, trong luồng đặt lịch và trong các màn hình quản trị.</p>`,
    '  <h2>Dịch vụ nổi bật</h2>',
    `  <p>Quy trình vận hành của cửa hàng được mô phỏng theo một cơ sở dịch vụ hiện đại. Khách hàng có thể xem giờ mở cửa, chọn dịch vụ, chọn nhân viên phù hợp, chọn khung giờ, xác nhận thông tin cá nhân và theo dõi trạng thái lịch hẹn. Đội ngũ store được trao quyền quản lý danh mục, giá, thời lượng, nhân sự, lịch làm việc và đánh giá sau khi hoàn thành. Mô tả này cố ý dài hơn để kiểm thử rich text, layout card, trang chi tiết, cắt ngắn nội dung và các trường hợp hiển thị trên mobile.</p>`,
    '  <h2>Không gian và đội ngũ</h2>',
    `  <p>Không gian của ${store.name} được định vị là thân thiện nhưng vẫn chuyên nghiệp. Khu vực tiếp đón cần có thông tin lịch hẹn rõ ràng, nhân viên nắm được nhu cầu của khách và hướng dẫn từng bước trước khi bắt đầu. Khu vực thực hiện dịch vụ ưu tiên vệ sinh, sự riêng tư và sự thoải mái. Các vật tư, sản phẩm và dụng cụ trong dữ liệu demo được mô tả theo hướng an toàn, nhẹ dịu, có kiểm soát và phù hợp với nhiều tình huống đặt lịch khác nhau.</p>`,
    `  <p>Với nhóm ${store.kind.label}, cửa hàng phục vụ cả khách hàng lần đầu trải nghiệm lẫn khách hàng quay lại theo chu kỳ. Nội dung mô tả tập trung vào cảm giác yên tâm, khả năng tư vấn trước dịch vụ, sự thống nhất trong thao tác và việc theo dõi kết quả sau khi hoàn tất. Khi dùng dữ liệu này trong demo, từng store có đủ nội dung để kiểm tra tìm kiếm toàn văn, hiển thị độ dài khác nhau, lọc theo danh mục và đánh giá mức độ phù hợp của dịch vụ với nhu cầu cá nhân.</p>`,
    `  <p>${store.name} cũng là một bản ghi demo để kiểm thử các tính năng dành cho chủ store. Owner được phép truy cập bảng điều khiển, cập nhật thông tin cửa hàng, quản lý nhân viên, gắn dịch vụ cho từng nhân viên, điều chỉnh lịch nghỉ và theo dõi booking. Các trường mô tả dài giúp phát hiện sớm lỗi tràn layout, lỗi xử lý HTML, lỗi cắt chữ, lỗi mã hóa tiếng Việt và lỗi hiệu năng khi trang tải nhiều nội dung cùng lúc.</p>`,
    `  <p>Tóm lại, ${store.name} không chỉ là một cửa hàng demo để lấp đầy danh sách. Bản ghi này dài hơn để tạo cảm giác giống một hồ sơ kinh doanh thật, có bối cảnh địa phương, có định vị dịch vụ, có quy trình vận hành và có kỳ vọng trải nghiệm cho khách. Nội dung này giúp frontend, API tìm kiếm, chatbot, thông báo và công cụ quản trị có đủ chất liệu để kiểm thử trong các tình huống gần với sản phẩm thực tế.</p>`,
    '</div>',
  ].join('\n');
}

function buildServiceDescription(store: StoreSeed, serviceName: string, serviceTemplate: ServiceTemplate, categoryName: string): string {
  return [
    '<div class="service-description">',
    `  <h1>${serviceName}</h1>`,
    `  <p>${serviceName} tại ${store.name} là gói dịch vụ demo thuộc nhóm ${categoryName}, được viết dài hơn để mô phỏng nội dung tư vấn trên một trang đặt lịch thật. Dịch vụ tập trung vào ${serviceTemplate.focus}, phù hợp với khách hàng muốn có một trải nghiệm được giải thích rõ trước khi quyết định đặt hẹn. Nội dung này giúp người dùng hiểu mục tiêu của liệu trình, cách nhân viên tiếp nhận nhu cầu, những điểm cần lưu ý và lý do nên chọn khung giờ phù hợp với lịch sinh hoạt cá nhân.</p>`,
    '  <h2>Quy trình thực hiện</h2>',
    '  <h3>Bước 1 - Tư vấn và đánh giá nhu cầu</h3>',
    `  <p>Trước khi bắt đầu, nhân viên sẽ ghi nhận tình trạng hiện tại, mong muốn của khách và các yếu tố ảnh hưởng đến kết quả. Với dịch vụ ${serviceTemplate.focus}, bước tư vấn có vai trò quan trọng vì từng khách hàng có nền tảng, thói quen chăm sóc, mức độ nhạy cảm và kỳ vọng khác nhau. Phần mô tả dài này tạo dữ liệu tốt hơn cho chatbot, trang chi tiết dịch vụ, tooltip, kết quả tìm kiếm và các màn hình so sánh dịch vụ trong cùng một cửa hàng.</p>`,
    '  <h3>Bước 2 - Làm sạch và chuẩn bị</h3>',
    `  <p>Quy trình thực hiện được mô phỏng theo hướng có cấu trúc: tiếp nhận, làm sạch hoặc chuẩn bị khu vực cần chăm sóc, tiến hành các bước chính, kiểm tra phản hồi của khách, hoàn thiện kết quả và hướng dẫn chăm sóc sau dịch vụ. Từng bước không nhất thiết dài trong thực tế, nhưng cần đủ rõ để khách hàng cảm thấy mình biết điều gì sẽ xảy ra. Điều này đặc biệt hữu ích khi kiểm thử luồng đặt lịch nhiều dịch vụ, hiển thị thời lượng và gắn nhân viên có chuyên môn.</p>`,
    '  <h3>Bước 3 - Thực hiện liệu trình chính</h3>',
    `  <p>Khách hàng nên chọn ${serviceName} khi cần một phương án ổn định, dễ hiểu và dễ lặp lại theo chu kỳ. Gói này không được mô tả như một cam kết kết quả tuyệt đối, mà như một trải nghiệm được chuẩn hóa, được điều chỉnh theo tình trạng thực tế. Nếu khách hàng có tiền sử kích ứng, đang điều trị da, vừa thực hiện thủ thuật khác hoặc có lịch trình đặc biệt, nhân viên nên hỏi kỹ trước khi bắt đầu để đảm bảo việc phục vụ phù hợp.</p>`,
    '  <h3>Bước 4 - Hoàn thiện và hướng dẫn sau dịch vụ</h3>',
    `  <p>Trong bộ dữ liệu demo, dịch vụ này cũng giúp kiểm tra các chức năng liên quan đến giá, biến thể thời lượng, danh mục, ảnh đại diện, đánh giá trung bình và phân công nhân viên. Khi nội dung mô tả dài hơn, frontend được thử nghiệm với các trường hợp như thu gọn văn bản, hiển thị rich text, cân bằng chiều cao card, render trên mobile, tìm kiếm theo từ khóa dài và đọc nội dung bằng công cụ hỗ trợ truy cập.</p>`,
    `  <p>Sau khi hoàn thành, khách hàng nên được nhắc về cách chăm sóc tại nhà, khoảng thời gian nên quay lại và những dấu hiệu cần theo dõi. Với ${serviceTemplate.focus}, phần hướng dẫn sau dịch vụ giúp nâng cao cảm giác chuyên nghiệp và làm cho trải nghiệm không kết thúc ngay tại thời điểm thanh toán. Cửa hàng dùng thông tin này để gửi thông báo, tạo ghi chú booking hoặc làm nội dung tham khảo cho nhân viên vừa vào làm.</p>`,
    '  <ul>',
    '    <li>Tư vấn nhu cầu, tình trạng hiện tại và mục tiêu trước khi bắt đầu.</li>',
    '    <li>Thực hiện theo quy trình vệ sinh, thao tác rõ ràng và có kiểm tra phản hồi.</li>',
    '    <li>Sử dụng sản phẩm hoặc dụng cụ phù hợp với tình huống dịch vụ đã chọn.</li>',
    '    <li>Ghi nhận lưu ý sau dịch vụ để khách dễ theo dõi và đặt lịch lần tiếp theo.</li>',
    '  </ul>',
    `  <p>${serviceName} được tạo ra để làm cho dữ liệu của ${store.name} có chiều sâu hơn. Nội dung không chỉ phục vụ việc đọc mô tả, mà còn giúp hệ thống có thêm ngữ liệu để kiểm tra tìm kiếm, sắp xếp, gợi ý, hiển thị danh sách và xử lý các trường rich text dài. Khi dùng trong demo, gói dịch vụ này tạo cảm giác gần với một cơ sở thật: có mục tiêu, có quy trình, có cảnh báo nhẹ, có hướng dẫn sau dịch vụ và có lý do để khách hàng quay lại.</p>`,
    '</div>',
  ].join('\n');
}

function roundedPrice(value: number, rand: () => number): number {
  const delta = randInt(-3, 3, rand) * 10000;
  return Math.max(80000, Math.round((value + delta) / 10000) * 10000);
}

function minOf(values: number[]): number {
  return values.length ? Math.min(...values) : 0;
}

function maxOf(values: number[]): number {
  return values.length ? Math.max(...values) : 0;
}

function assertNoKnownTextIssues(sqlOutput: string, accountsOutput: string): void {
  const knownBadPatterns = [
    'khôáng',
    'khôang',
    'khôa',
    'cơ thểm',
    'móng muon',
    'Ã',
    'Ä',
    'Æ',
    'áº',
    'á»',
  ];
  const content = `${sqlOutput}\n${accountsOutput}`;
  const found = knownBadPatterns.filter((pattern) => content.includes(pattern));

  if (found.length) {
    throw new Error(`Generated seed contains suspicious Vietnamese text: ${found.join(', ')}`);
  }
}

function render(): { sql: string; accounts: string; stats: Record<string, number> } {
  const stores = makeStores();
  const sqlLines: string[] = [
    '-- ============================================================',
    `-- SEED: ${DEMO_STORE_COUNT} Demo Stores - Glowora Platform`,
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
  const storeServiceCounts: number[] = [];
  const storeCategoryCounts: number[] = [];
  const serviceImageCounts: number[] = [];
  const serviceVariantCounts: number[] = [];
  const accounts: string[] = [
    `# Glowora seed ${DEMO_STORE_COUNT} accounts`,
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
    const address = `${randInt(1, 199, rand)} ${pick(['Nguyễn Huệ', 'Lê Lợi', 'Trần Hưng Đạo', 'Hai Bà Trưng', 'Phan Chu Trinh', 'Lý Thường Kiệt'], rand)}`;
    const staffCount = randInt(3, 10, seededRand(store.index));
    const serviceCount = randInt(MIN_SERVICES_PER_STORE, MAX_SERVICES_PER_STORE, seededRand(store.index * 4099 + 1000));
    storeServiceCounts.push(serviceCount);

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
        `(${sql(randomUUID())}, ${subUser(staffEmail)}, ${subStore(store.slug)}, ${sql(specialty)}, ${sql(`Phụ trách ${specialty.toLowerCase()} tại ${store.name}.`)}, ${(4.1 + rand() * 0.8).toFixed(2)}, ${randInt(6, 90, rand)}, 'ACTIVE', NULL, NULL, NOW(), NOW())`,
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

    const categories = selectStoreCategories(store);
    storeCategoryCounts.push(categories.length);
    for (const category of categories) {
      shopCategoryRows.push(
        `(${sql(randomUUID())}, ${sql(category.name)}, NULL, ${sql(category.description)}, NULL, ${subStore(store.slug)}, ${subGlobalCategory(category.parentSlug)}, NOW(), NOW())`,
      );
    }

    const templates = SERVICE_TEMPLATES[store.kind.key].filter((template) => categories.some((category) => category.key === template.categoryKey));
    for (let serviceIndex = 1; serviceIndex <= serviceCount; serviceIndex++) {
      const template = templates[(serviceIndex - 1) % templates.length];
      const localRand = seededRand(store.index * 10000 + serviceIndex);
      const serviceSlug = `${template.baseSlug}-${String(serviceIndex).padStart(2, '0')}`;
      store.serviceSlugs.push(serviceSlug);
      const serviceName = `${template.name} ${serviceIndex > templates.length ? serviceIndex : ''}`.trim();
      const category = categories.find((item) => item.key === template.categoryKey) ?? categories[0];
      const imageUrls = buildServiceImageUrls(store, template, serviceIndex, localRand);
      serviceImageCounts.push(imageUrls.length);

      serviceRows.push(
        `(${sql(randomUUID())}, ${subStore(store.slug)}, ${subShopCategory(category.name, store.slug)}, ${sql(serviceName)}, ${sql(serviceSlug)}, ${sql(buildServiceDescription(store, serviceName, template, category.name))}, ${sql(JSON.stringify(imageUrls))}, 'ACTIVE', ${(4.15 + localRand() * 0.75).toFixed(2)}, NOW(), NOW())`,
      );

      const variantCount = randInt(MIN_VARIANTS_PER_SERVICE, MAX_VARIANTS_PER_SERVICE, localRand);
      serviceVariantCounts.push(variantCount);
      for (let variantIndex = 0; variantIndex < variantCount; variantIndex++) {
        const duration = template.duration[Math.min(variantIndex, 2)];
        const price = roundedPrice(template.price[Math.min(variantIndex, 2)], localRand);
        const label = variantIndex === 0 ? 'Cơ bản' : variantIndex === 1 ? 'Nâng cao' : variantIndex === 2 ? 'VIP' : 'Signature';
        variantRows.push(
          `(${sql(randomUUID())}, ${subService(serviceSlug, store.slug)}, ${sql(`${duration} phút - ${label}`)}, ${sql(`${label} cho ${serviceName}, thời lượng ${duration} phút.`)}, ${duration}, ${money(price)}, ${variantIndex}, 'ACTIVE', NOW(), NOW())`,
        );
      }
    }

    accounts.push(`| ${store.code} | ${store.name} | \`${store.ownerEmail}\` | ${store.staffEmails.map((email) => `\`${email}\``).join('<br>')} |`);
  }

  sqlLines.push('-- SECTION 0: Safety cleanup for regenerated demo seed');
  sqlLines.push('SET FOREIGN_KEY_CHECKS = 0;');
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
    ...batchInsert(variantRows, 'service_variants', ['id', 'service_id', 'name', 'description', 'duration', 'price', 'sort_order', 'status', 'created_at', 'updated_at'], {
      batchSize: 150,
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
    minServicesPerStore: minOf(storeServiceCounts),
    maxServicesPerStore: maxOf(storeServiceCounts),
    minCategoriesPerStore: minOf(storeCategoryCounts),
    maxCategoriesPerStore: maxOf(storeCategoryCounts),
    minImagesPerService: minOf(serviceImageCounts),
    maxImagesPerService: maxOf(serviceImageCounts),
    minVariantsPerService: minOf(serviceVariantCounts),
    maxVariantsPerService: maxOf(serviceVariantCounts),
  };

  return {
    sql: sqlLines.join('\n'),
    accounts: accounts.join('\n') + '\n',
    stats,
  };
}

function main() {
  const result = render();
  assertNoKnownTextIssues(result.sql, result.accounts);
  fs.writeFileSync(OUTPUT_SQL, result.sql, 'utf8');
  fs.writeFileSync(OUTPUT_ACCOUNTS, result.accounts, 'utf8');

  console.log(`Generated ${DEMO_STORE_COUNT}-store demo seed`);
  for (const [key, value] of Object.entries(result.stats)) {
    console.log(`${key}: ${value}`);
  }
  console.log(`Output: ${OUTPUT_SQL}`);
  console.log(`Accounts: ${OUTPUT_ACCOUNTS}`);
}

main();
