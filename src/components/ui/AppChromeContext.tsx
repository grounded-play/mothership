"use client";

import { createContext, useContext, type Dispatch, type ReactNode, type SetStateAction } from "react";

export type AppChromeOverride = {
    title?: string;
    icon?: ReactNode;
    statusItems?: ReactNode;
    hideBridgeTime?: boolean;
    titleMaxWidthClassName?: string;
};

type AppChromeContextValue = {
    override: AppChromeOverride | null;
    setOverride: Dispatch<SetStateAction<AppChromeOverride | null>>;
};

export const AppChromeContext = createContext<AppChromeContextValue | null>(null);

export function useAppChrome() {
    const context = useContext(AppChromeContext);
    if (!context) {
        throw new Error("useAppChrome must be used within AppChromeContext");
    }

    return {
        override: context.override,
        setOverride: context.setOverride,
        clearOverride: () => context.setOverride(null),
    };
}
