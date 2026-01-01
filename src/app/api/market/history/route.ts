import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const transactions = await (prisma as any).marketTransaction.findMany({
            take: 10,
            orderBy: { timestamp: 'desc' },
            include: {
                item: true,
                seller: { select: { name: true } },
                buyer: { select: { name: true } }
            }
        });
        return NextResponse.json(transactions);
    } catch (e) {
        return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
    }
}
