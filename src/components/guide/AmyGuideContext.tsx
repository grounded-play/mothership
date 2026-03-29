"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type AmyGuideTransmissionKind = "guide" | "lore" | "warning";

export interface AmyGuideTransmission {
    kind: AmyGuideTransmissionKind;
    title: string;
    text: string;
}

interface AmyGuideOverride {
    source: string;
    messages: AmyGuideTransmission[];
}

interface AmyGuideContextValue {
    override: AmyGuideOverride | null;
    setOverride: (next: AmyGuideOverride | null) => void;
    clearOverride: (source?: string) => void;
}

const AmyGuideContext = createContext<AmyGuideContextValue | null>(null);

function sameOverride(a: AmyGuideOverride | null, b: AmyGuideOverride | null) {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.source !== b.source) return false;
    if (a.messages.length !== b.messages.length) return false;
    return a.messages.every((message, index) => {
        const next = b.messages[index];
        return Boolean(next)
            && message.kind === next.kind
            && message.title === next.title
            && message.text === next.text;
    });
}

export function AmyGuideProvider({ children }: { children: ReactNode }) {
    const [override, setOverrideState] = useState<AmyGuideOverride | null>(null);

    const setOverride = useCallback((next: AmyGuideOverride | null) => {
        setOverrideState((current) => {
            if (sameOverride(current, next)) {
                return current;
            }
            return next;
        });
    }, []);

    const clearOverride = useCallback((source?: string) => {
        setOverrideState((current) => {
            if (!current) return null;
            if (source && current.source !== source) return current;
            return null;
        });
    }, []);

    const value = useMemo<AmyGuideContextValue>(() => ({
        override,
        setOverride,
        clearOverride,
    }), [clearOverride, override, setOverride]);

    return (
        <AmyGuideContext.Provider value={value}>
            {children}
        </AmyGuideContext.Provider>
    );
}

export function useAmyGuide() {
    const context = useContext(AmyGuideContext);
    if (!context) {
        throw new Error("useAmyGuide must be used within AmyGuideProvider");
    }
    return context;
}
