"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

type ConfirmDialogProps = {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    busy?: boolean;
};

export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = "CONFIRM",
    cancelLabel = "CANCEL",
    onConfirm,
    onCancel,
    busy
}: ConfirmDialogProps) {
    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <motion.div
                        initial={{ scale: 0.96, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.96, opacity: 0 }}
                        className="w-full max-w-sm rounded-xl border border-white/10 bg-black/90 p-6 text-center shadow-2xl"
                    >
                        <div className="text-xs text-neon-cyan uppercase tracking-widest mb-2">{title}</div>
                        <div className="text-sm text-white mb-5">{message}</div>
                        <div className="flex justify-center gap-3">
                            <Button
                                variant="outline"
                                className="h-8 text-xs border-white/20 text-gray-300 hover:text-white"
                                onClick={onCancel}
                                disabled={busy}
                            >
                                {cancelLabel}
                            </Button>
                            <Button
                                className="h-8 text-xs bg-neon-cyan text-black"
                                onClick={onConfirm}
                                disabled={busy}
                            >
                                {confirmLabel}
                            </Button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
