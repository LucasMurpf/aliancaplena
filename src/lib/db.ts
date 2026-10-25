import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Uma única instância do Prisma por processo (evita estourar conexões em dev,
// onde o hot reload recarrega este módulo).
const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

function criarPrisma(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalParaPrisma.prisma ?? criarPrisma();

if (process.env.NODE_ENV !== "production") {
  globalParaPrisma.prisma = prisma;
}
