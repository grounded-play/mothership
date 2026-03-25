import { NextResponse } from "next/server";
import { ensurePrinterWorker } from "@/lib/printerWorker";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const reset = searchParams.get("reset") === "true";
        
        if (reset) {
            const globalState = globalThis as any;
            if (globalState.__printerWorkerState?.timer) {
                clearInterval(globalState.__printerWorkerState.timer);
            }
            globalState.__printerWorkerState = undefined;
            (globalThis as any).__printerWorkerStarted = false; // Legacy flag if exists
        }

        ensurePrinterWorker();
        const state = (globalThis as any).__printerWorkerState;
        
        return NextResponse.json({
            success: true,
            state: {
                started: state?.started,
                running: state?.running,
                pulseCount: state?.pulseCount,
                lastPulse: state?.lastPulse ? new Date(state.lastPulse).toISOString() : null,
                comfyOnline: state?.comfyOnline,
                currentItemId: state?.currentItemId
            }
        });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
