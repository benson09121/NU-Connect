import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
})

export const prisma = new PrismaClient({adapter});

function toPgPlaceholders(sql: string): string {
  let idx = 0;
  return sql.replace(/\?/g, () => {
    idx += 1;
    return `$${idx}`;
  });
}

type LegacyQueryResult = [any[], any?];

type LegacyConnection = {
  query: (sql: string, params?: any[]) => Promise<LegacyQueryResult>;
  release: () => void;
};

export async function getConnection(): Promise<LegacyConnection> {
  return {
    query: async (sql: string, params: any[] = []): Promise<LegacyQueryResult> => {
      const normalized = toPgPlaceholders(sql);

      try {
        const result = await prisma.$queryRawUnsafe(normalized, ...params);
        return [Array.isArray(result) ? result : []];
      } catch (queryErr) {
        // Fallback for statements that do not return rows.
        const count = await prisma.$executeRawUnsafe(normalized, ...params);
        return [[{ affectedRows: count }]];
      }
    },
    release: () => {
      // No-op for Prisma compatibility connection.
    },
  };
}