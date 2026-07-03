import http from 'k6/http';

const OWNER_PASSWORD = 'Owner@123456';
const STORE_COUNT = 60; // prisma/seed_200_stores.sql seeds 60 demo stores
const MAX_STAFF_PER_STORE = 5;

const CUSTOMER_PASSWORD = 'Customer@123456';
const CUSTOMER_COUNT = 200; // prisma/seed_customers.sql seeds 200 demo customers

// Owner/staff demo accounts (prisma/seed_200_stores.sql, see
// prisma/seed_200_accounts.md). Each holds a store-scoped UserRole, so
// BookingsService blocks them from booking at their OWN store - only usable
// as "customer" callers against a DIFFERENT store. This generates the full
// list of candidate emails to try.
export function candidateEmails() {
  const emails = [];
  for (let s = 1; s <= STORE_COUNT; s++) {
    const store = String(s).padStart(3, '0');
    emails.push(`owner.s${store}@glowora.local`);
    for (let u = 1; u <= MAX_STAFF_PER_STORE; u++) {
      emails.push(`staff.s${store}u${String(u).padStart(2, '0')}@glowora.local`);
    }
  }
  return emails;
}

// Demo CUSTOMER accounts (prisma/seed_customers.sql, see
// prisma/seed_customers_accounts.md). Their UserRole is global (storeId =
// NULL), so they hold no membership at any store and can book ANY store.
export function customerCandidateEmails() {
  const emails = [];
  for (let c = 1; c <= CUSTOMER_COUNT; c++) {
    emails.push(`customer${String(c).padStart(3, '0')}@glowora.local`);
  }
  return emails;
}

export function login(baseUrl, email, password) {
  const res = http.post(
    `${baseUrl}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'Login' } },
  );
  if (res.status !== 200 && res.status !== 201) return null;
  const body = res.json();
  return body && body.data && body.data.access_token ? body.data.access_token : null;
}

// Logs in demo owner/staff accounts one by one (some candidates, e.g. staff
// u05 on a 4-staff store, don't exist and are silently skipped) until `max`
// successful logins are collected, or the candidate list is exhausted (~325
// accounts total). Returns [{ email, token }].
export function loginPool(baseUrl, max) {
  const pool = [];
  for (const email of candidateEmails()) {
    if (pool.length >= max) break;
    const token = login(baseUrl, email, OWNER_PASSWORD);
    if (token) pool.push({ email, token });
  }
  return pool;
}

// Same as loginPool() but for the 200 demo CUSTOMER accounts. Returns
// [{ email, token }].
export function loginCustomerPool(baseUrl, max) {
  const pool = [];
  for (const email of customerCandidateEmails()) {
    if (pool.length >= max) break;
    const token = login(baseUrl, email, CUSTOMER_PASSWORD);
    if (token) pool.push({ email, token });
  }
  return pool;
}
