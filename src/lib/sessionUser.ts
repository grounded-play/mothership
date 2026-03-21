import { prisma } from "@/lib/prisma";

export async function findUserBySessionEmail(email?: string | null) {
  if (!email) return null;

  return prisma.user.findUnique({
    where: { email },
  });
}

export async function touchUserByEmail(email?: string | null) {
  if (!email) return false;

  const result = await prisma.user.updateMany({
    where: { email },
    data: { updatedAt: new Date() },
  });

  return result.count > 0;
}
