# ============================================================
# Stage 1 – Builder: cài đầy đủ deps, generate Prisma, build
# ============================================================
FROM node:22-alpine AS builder
WORKDIR /app

# Cài pnpm qua corepack (lockfileVersion 9 → pnpm v9+)
RUN corepack enable && corepack prepare pnpm@9 --activate

# Cài dependencies (bao gồm devDeps cần để build)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client
RUN DATABASE_URL="mysql://user:password@localhost:3306/glowora_business" npx prisma generate

# Compile TypeScript → dist/  (bao gồm cả mail templates qua nest-cli assets)
RUN pnpm run build

# ============================================================
# Stage 2 – Runner: chỉ production deps + compiled output
# ============================================================
FROM node:22-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

# Non-root user để tăng bảo mật
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Chỉ cài production dependencies
COPY package.json pnpm-lock.yaml prisma.config.ts ./
RUN pnpm install --frozen-lockfile --prod

# Copy prisma schema và generate client (prisma nằm trong prod deps)
COPY prisma ./prisma
RUN DATABASE_URL="mysql://user:password@localhost:3306/glowora_business" npx prisma generate

# Copy compiled app từ builder stage
COPY --from=builder /app/dist ./dist

# Copy entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

USER appuser

EXPOSE 8080

ENTRYPOINT ["./docker-entrypoint.sh"]
