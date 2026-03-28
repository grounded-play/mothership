"use client";

import PersistentAudioController from "@/components/audio/PersistentAudioController";
import { AmyGuideProvider } from "@/components/guide/AmyGuideContext";
import MiniPlayer from "@/components/audio/MiniPlayer";
import AmyGuidePanel from "@/components/guide/AmyGuidePanel";
import AutoFitViewport from "@/components/layout/AutoFitViewport";
import ResponsiveShell from "@/components/layout/ResponsiveShell";
import { usePathname } from "next/navigation";

export default function AppFrame({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const showDock = Boolean(pathname && pathname !== "/" && !pathname.startsWith("/api/"));

    return (
        <ResponsiveShell>
            <AmyGuideProvider>
                <div className="relative flex h-full w-full flex-col bg-black shadow-[0_0_80px_rgba(0,0,0,0.92)]">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,243,255,0.08),transparent_38%),radial-gradient(circle_at_bottom,rgba(255,0,255,0.05),transparent_30%)]" />
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-white/5" />
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-white/5" />
                    <PersistentAudioController />
                    <div className="relative flex-1 min-h-0 overflow-hidden">
                        <AutoFitViewport contentKey={`${pathname ?? ""}:${showDock ? "dock" : "nodock"}`}>
                            {children}
                        </AutoFitViewport>
                    </div>
                    {showDock && (
                        <div className="pointer-events-none relative z-[90] flex h-[104px] shrink-0 items-end justify-between gap-3 px-3 pb-3">
                            <div className="pointer-events-auto shrink-0">
                                <MiniPlayer />
                            </div>
                            <div className="pointer-events-auto shrink-0">
                                <AmyGuidePanel />
                            </div>
                        </div>
                    )}
                </div>
            </AmyGuideProvider>
        </ResponsiveShell>
    );
}
