import { PrismaClient } from '@prisma/client'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

const enableQueryLog = process.env.PRISMA_LOG === 'true';

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: enableQueryLog ? ['query'] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
