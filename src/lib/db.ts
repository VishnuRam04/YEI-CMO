import "server-only";

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/generated/prisma/client";
import { requireServerEnv } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  northwindPrisma?: PrismaClient;
};

export function getDb(): PrismaClient {
  if (!globalForPrisma.northwindPrisma) {
    const adapter = new PrismaNeon({
      connectionString: requireServerEnv("DATABASE_URL"),
    });
    globalForPrisma.northwindPrisma = new PrismaClient({ adapter });
  }

  return globalForPrisma.northwindPrisma;
}
