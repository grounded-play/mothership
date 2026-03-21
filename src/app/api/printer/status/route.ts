import { NextResponse } from "next/server";

const COMFY_API = "http://127.0.0.1:8188";
const TIMEOUT_MS = 1500;

export async function GET() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(COMFY_API, { signal: controller.signal, cache: "no-store" });
        clearTimeout(timeout);
        if (!res.ok) {
            return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
        }
        return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch {
        clearTimeout(timeout);
        return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
}
