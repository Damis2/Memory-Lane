import { PrismaClient } from "@prisma/client";

// Reuse the Prisma client across hot reloads in dev mode to avoid
// exhausting the Postgres connection limit and to avoid paying the
// connection setup cost on every request.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    // Shorter connection timeout so a cold Neon/Supabase instance gives
    // a fast error rather than hanging for 30+ seconds. The default is
    // effectively unlimited in some Prisma versions.
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
