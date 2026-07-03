import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcrypt';

const OUTPUT_SQL = path.join(__dirname, 'seed_customers.sql');
const OUTPUT_ACCOUNTS = path.join(__dirname, 'seed_customers_accounts.md');
const CUSTOMER_COUNT = 200;
const CUSTOMER_PASSWORD = 'Customer@123456';
const PASSWORD_HASH = bcrypt.hashSync(CUSTOMER_PASSWORD, 10);

type CityPlan = {
  provinceId: number;
  label: string;
  weight: number; // tỉ trọng phân bổ khách hàng, phỏng theo mật độ store ở generate_seed_200.ts
  wards: number[];
  streets: string[];
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

function subRole(code: 'CUSTOMER'): string {
  return `(SELECT \`id\` FROM \`roles\` WHERE \`code\` = ${sql(code)} AND \`store_id\` IS NULL LIMIT 1)`;
}

// ── Dữ liệu tên Việt Nam ─────────────────────────────────────────────────────
const SURNAMES = [
  'Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ',
  'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương',
];

const MIDDLE_NAMES = ['Văn', 'Thị', 'Hữu', 'Đức', 'Minh', 'Ngọc', 'Thanh', 'Gia', 'Kim', 'Xuân'];

const GIVEN_NAMES = [
  'Hùng', 'Huy', 'Nhi', 'Hạnh', 'Tú', 'Anh', 'Hân', 'Như', 'Ngọc', 'Trúc',
  'Linh', 'Thảo', 'Chi', 'Dương', 'Yến', 'Hà', 'Ngân', 'Minh', 'Khang', 'Nam',
  'Bảo', 'Kiệt', 'Vy', 'My', 'Lan', 'Ánh', 'Trang', 'An', 'Châu', 'Hằng',
  'Phúc', 'Trâm', 'Khánh', 'Long', 'Quân', 'Đăng', 'Khoa', 'Nghĩa', 'Sang', 'Tài',
  'Phương', 'Quỳnh', 'Duyên', 'Thư', 'Uyên', 'Vân', 'Xuyến', 'Yên', 'Loan', 'Nga',
  'Đạt', 'Cường', 'Dũng', 'Hải', 'Sơn', 'Thắng', 'Việt', 'Toàn', 'Phong', 'Thịnh',
];

// ── Địa lý — dùng lại provinceId/ward thật từ seed_provinces_wards.sql ──────
const CITIES: CityPlan[] = [
  {
    provinceId: 29,
    label: 'Hồ Chí Minh',
    weight: 15,
    wards: [71701001, 71701002, 71701003, 71701004, 71703005, 71703006, 71709007, 71703008, 71709009, 71709010],
    streets: ['Nguyễn Huệ', 'Lê Lợi', 'Trần Hưng Đạo', 'Hai Bà Trưng', 'Phan Chu Trinh', 'Lý Thường Kiệt'],
  },
  {
    provinceId: 1,
    label: 'Hà Nội',
    weight: 15,
    wards: [10105001, 10105002, 10101003, 10101004, 10101005, 10107006, 10107007, 10107008, 10109009, 10109010],
    streets: ['Kim Mã', 'Giảng Võ', 'Bà Triệu', 'Tôn Đức Thắng', 'Nguyễn Chí Thanh', 'Láng Hạ'],
  },
  {
    provinceId: 21,
    label: 'Đà Nẵng',
    weight: 8,
    wards: [50101001, 50101002, 50103003, 50115004, 50105005, 50105006, 50107007, 50109008],
    streets: ['Bạch Đằng', 'Trần Phú', 'Nguyễn Văn Linh', 'Điện Biên Phủ'],
  },
  {
    provinceId: 33,
    label: 'Cần Thơ',
    weight: 6,
    wards: [81519001, 81519002, 81519003, 81519004, 81521005, 81521006],
    streets: ['30 Tháng 4', 'Nguyễn Trãi', 'Mậu Thân'],
  },
  {
    provinceId: 20,
    label: 'Huế',
    weight: 4,
    wards: [41109001, 41119002, 41109003, 41101004, 41101005],
    streets: ['Hùng Vương', 'Lê Duẩn', 'Đống Đa'],
  },
  {
    provinceId: 23,
    label: 'Khánh Hòa',
    weight: 4,
    wards: [51101001, 51101002, 51101003, 51101004, 51109005],
    streets: ['Trần Phú', 'Nguyễn Thị Minh Khai', 'Lê Thánh Tôn'],
  },
  {
    provinceId: 28,
    label: 'Đồng Nai',
    weight: 3,
    wards: [71301001, 71301002, 71301003, 71301004],
    streets: ['Võ Thị Sáu', 'Phạm Văn Thuận', 'Đồng Khởi'],
  },
  {
    provinceId: 4,
    label: 'Hải Phòng',
    weight: 2,
    wards: [10301008, 10301009, 10303010, 10303011],
    streets: ['Điện Biên Phủ', 'Lạch Tray'],
  },
  {
    provinceId: 3,
    label: 'Quảng Ninh',
    weight: 1,
    wards: [22501015, 22501017, 22501021],
    streets: ['Trần Hưng Đạo', 'Lê Thánh Tông'],
  },
  {
    provinceId: 26,
    label: 'Lâm Đồng',
    weight: 1,
    wards: [70301001, 70301002, 70301003],
    streets: ['Trần Phú', 'Nguyễn Chí Thanh'],
  },
  {
    provinceId: 2,
    label: 'Bắc Ninh',
    weight: 1,
    wards: [22113001, 22113002, 22113003],
    streets: ['Ngô Gia Tự', 'Nguyễn Văn Cừ'],
  },
];

const WEIGHTED_CITIES: CityPlan[] = CITIES.flatMap((city) => Array(city.weight).fill(city));

function fullName(rand: () => number): string {
  const surname = pick(SURNAMES, rand);
  const middle = pick(MIDDLE_NAMES, rand);
  const given = pick(GIVEN_NAMES, rand);
  return `${surname} ${middle} ${given}`;
}

function phoneNumber(index: number): string {
  return `07${String(index).padStart(8, '0')}`;
}

function render(): { sql: string; accounts: string } {
  const sqlLines: string[] = [
    '-- ============================================================',
    `-- SEED: ${CUSTOMER_COUNT} Demo Customers - Glowora Platform`,
    `-- Generated: ${new Date().toISOString()}`,
    `-- Password for all customer accounts: ${CUSTOMER_PASSWORD}`,
    '-- Prerequisite: pnpm run db:seed (roles/permissions) và seed_provinces_wards.sql',
    '-- ============================================================',
    'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;',
    'START TRANSACTION;',
    '',
    `SET @customer_password_hash = ${sql(PASSWORD_HASH)};`,
    '',
    '-- SECTION 0: Safety cleanup for regenerated demo seed',
    "DELETE FROM `users` WHERE `email` LIKE 'customer%@glowora.local';",
    '',
  ];

  const userRows: string[] = [];
  const roleRows: string[] = [];
  const accounts: string[] = [
    `# Glowora seed ${CUSTOMER_COUNT} customer accounts`,
    '',
    `Password for every account: \`${CUSTOMER_PASSWORD}\``,
    '',
    '| # | Email | Full name | City |',
    '|---|---|---|---|',
  ];

  for (let index = 1; index <= CUSTOMER_COUNT; index++) {
    const rand = seededRand(index * 2699);
    const code = String(index).padStart(3, '0');
    const email = `customer${code}@glowora.local`;
    const name = fullName(rand);
    const city = pick(WEIGHTED_CITIES, rand);
    const wardId = pick(city.wards, rand);
    const address = `${randInt(1, 299, rand)} ${pick(city.streets, rand)}`;
    const userId = randomUUID();

    userRows.push(
      `(${sql(userId)}, ${sql(name)}, ${sql(email)}, @customer_password_hash, ${sql(phoneNumber(index))}, ${sql(address)}, ${city.provinceId}, ${wardId}, 'ACTIVE', NOW(), NOW())`,
    );

    roleRows.push(`(${sql(randomUUID())}, ${sql(userId)}, ${subRole('CUSTOMER')}, NULL, NOW())`);

    accounts.push(`| ${code} | \`${email}\` | ${name} | ${city.label} |`);
  }

  sqlLines.push('-- SECTION 1: Customer users');
  sqlLines.push(
    ...batchInsert(
      userRows,
      'users',
      ['id', 'full_name', 'email', 'password', 'phone', 'address', 'province_id', 'ward_id', 'status', 'created_at', 'updated_at'],
      {
        suffix:
          'ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`), `password` = VALUES(`password`), `phone` = VALUES(`phone`), `address` = VALUES(`address`), `province_id` = VALUES(`province_id`), `ward_id` = VALUES(`ward_id`), `status` = VALUES(`status`), `updated_at` = NOW();',
      },
    ),
  );

  sqlLines.push('-- SECTION 2: Customer user roles');
  sqlLines.push(
    ...batchInsert(roleRows, 'user_roles', ['id', 'user_id', 'role_id', 'store_id', 'created_at'], {
      suffix: 'ON DUPLICATE KEY UPDATE `created_at` = `created_at`;',
    }),
  );

  sqlLines.push('COMMIT;');
  sqlLines.push('');

  return {
    sql: sqlLines.join('\n'),
    accounts: accounts.join('\n') + '\n',
  };
}

function main() {
  const result = render();
  fs.writeFileSync(OUTPUT_SQL, result.sql, 'utf8');
  fs.writeFileSync(OUTPUT_ACCOUNTS, result.accounts, 'utf8');

  console.log(`Generated ${CUSTOMER_COUNT} demo customers`);
  console.log(`Output: ${OUTPUT_SQL}`);
  console.log(`Accounts: ${OUTPUT_ACCOUNTS}`);
}

main();
