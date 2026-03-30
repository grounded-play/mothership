import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findUserBySessionEmail, touchUserByEmail } from "@/lib/sessionUser";
import { getMenuStatusSnapshot } from "@/lib/menuStatus";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await findUserBySessionEmail(session.user.email);
    if (!user) return NextResponse.json({ error: "Session expired" }, { status: 401 });

    // Mark user as active
    await touchUserByEmail(user.email);

    const status = await getMenuStatusSnapshot(user.id);

    return NextResponse.json(status, {
        headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
    });
}
