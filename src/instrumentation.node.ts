import { ensurePrinterWorker } from "@/lib/printerWorker";

export function register() {
    ensurePrinterWorker();
}
