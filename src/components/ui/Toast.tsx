"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, AlertTriangle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextValue {
    addToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((message: string, type: ToastType = "info", duration = 3000) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);

        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
    }, []);

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            {children}
            <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none items-center w-full max-w-md">
                <AnimatePresence>
                    {toasts.map((toast) => (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="pointer-events-auto w-full glass-panel bg-black/90 border-t-4 border-l-0 p-3 rounded-b-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex items-center gap-3 backdrop-blur-xl"
                            style={{
                                borderTopColor:
                                    toast.type === "success" ? "#4ade80" :
                                        toast.type === "error" ? "#ef4444" : "#0ea5e9"
                            }}
                        >
                            {toast.type === "success" && <Check className="w-5 h-5 text-green-400" />}
                            {toast.type === "error" && <AlertTriangle className="w-5 h-5 text-red-400" />}
                            {toast.type === "info" && <Info className="w-5 h-5 text-sky-400" />}

                            <div className="flex-1 text-sm font-bold text-white tracking-wide text-center uppercase">{toast.message}</div>
                            <button onClick={() => removeToast(toast.id)} className="text-gray-400 hover:text-white">
                                <X className="w-4 h-4" />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return context;
}
