"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

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

export function AmyGuideProvider({ children }: { children: ReactNode }) {
    const [override, setOverrideState] = useState<AmyGuideOverride | null>(null);

    const value = useMemo<AmyGuideContextValue>(() => ({
        override,
        setOverride: (next) => setOverrideState(next),
        clearOverride: (source) => {
            setOverrideState((current) => {
                if (!current) return null;
                if (!source || current.source === source) return null;
                return current;
            });
        }
    }), [override]);

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
