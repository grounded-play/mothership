"use client";

import { useEffect, useRef, useState } from "react";
import { Radio, Volume2, X } from "lucide-react";
import PersistentAudioController from "@/components/audio/PersistentAudioController";
import { AmyGuideProvider } from "@/components/guide/AmyGuideContext";
import MiniPlayer from "@/components/audio/MiniPlayer";
import AmyGuidePanel from "@/components/guide/AmyGuidePanel";
import ResponsiveShell from "@/components/layout/ResponsiveShell";
import FitCanvas from "@/components/layout/FitCanvas";
import { usePathname } from "next/navigation";

const APP_STAGE_WIDTH = 1440;
const APP_STAGE_HEIGHT = 810;
const FULL_DOCK_HEIGHT = 110;
const COMPACT_DOCK_HEIGHT = 54;
type CompactPanel = "player" | "guide";

export default function AppFrame({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const routeOwnsDock = Boolean(pathname && pathname.startsWith("/menu"));
    const showDock = Boolean(pathname && pathname !== "/" && !pathname.startsWith("/api/") && !routeOwnsDock);
    const [isCompactViewport, setIsCompactViewport] = useState(false);
    const [compactPanelState, setCompactPanelState] = useState<{ panel: CompactPanel | null; pathname: string | null }>({
        panel: null,
        pathname: null,
    });
    const compactLauncherRef = useRef<HTMLDivElement | null>(null);
    const compactPanelRef = useRef<HTMLDivElement | null>(null);
    const routeKey = pathname ?? null;
    const compactPanel = isCompactViewport && compactPanelState.pathname === routeKey ? compactPanelState.panel : null;

    const closeCompactPanel = () => {
        setCompactPanelState({ panel: null, pathname: routeKey });
    };

    const toggleCompactPanel = (panel: CompactPanel) => {
        setCompactPanelState((current) => ({
            pathname: routeKey,
            panel: current.pathname === routeKey && current.panel === panel ? null : panel,
        }));
    };

    useEffect(() => {
        const updateViewportMode = () => {
            if (typeof window === "undefined") return;
            const width = window.visualViewport?.width ?? window.innerWidth;
            const height = window.visualViewport?.height ?? window.innerHeight;
            const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
            setIsCompactViewport(coarsePointer || width < 1180 || height < 640);
        };

        updateViewportMode();
        window.addEventListener("resize", updateViewportMode);
        window.visualViewport?.addEventListener("resize", updateViewportMode);
        return () => {
            window.removeEventListener("resize", updateViewportMode);
            window.visualViewport?.removeEventListener("resize", updateViewportMode);
        };
    }, []);

    useEffect(() => {
        if (!compactPanel || !isCompactViewport) return;

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (compactPanelRef.current?.contains(target)) return;
            if (compactLauncherRef.current?.contains(target)) return;
            setCompactPanelState({ panel: null, pathname: routeKey });
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setCompactPanelState({ panel: null, pathname: routeKey });
            }
        };

        document.addEventListener("pointerdown", handlePointerDown, true);
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown, true);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [compactPanel, isCompactViewport, routeKey]);

    return (
        <ResponsiveShell>
            <AmyGuideProvider>
                <PersistentAudioController />
                <FitCanvas width={APP_STAGE_WIDTH} height={APP_STAGE_HEIGHT} maxScale={2.4} padding={10}>
                    <div className="relative h-full w-full overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-[0_0_80px_rgba(0,0,0,0.92)]">
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,243,255,0.08),transparent_38%),radial-gradient(circle_at_bottom,rgba(255,0,255,0.05),transparent_30%)]" />
                        <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-white/5" />
                        <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-white/5" />

                        <div
                            className="grid h-full w-full"
                            style={{
                                gridTemplateRows: showDock
                                    ? `minmax(0,1fr) ${isCompactViewport ? COMPACT_DOCK_HEIGHT : FULL_DOCK_HEIGHT}px`
                                    : "minmax(0,1fr)",
                            }}
                        >
                            <div className="relative min-h-0 overflow-hidden">
                                {children}
                            </div>

                            {showDock && (
                                isCompactViewport ? (
                                    <div className="relative flex items-center justify-center px-3 pb-3">
                                        <div ref={compactLauncherRef} className="flex items-center justify-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => toggleCompactPanel("player")}
                                                className={`flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition-colors ${
                                                    compactPanel === "player"
                                                        ? "border-neon-cyan bg-cyan-500/15 text-neon-cyan"
                                                        : "border-white/10 bg-black/85 text-white"
                                                }`}
                                            >
                                                <Volume2 className="h-3.5 w-3.5" />
                                                Audio
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleCompactPanel("guide")}
                                                className={`flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition-colors ${
                                                    compactPanel === "guide"
                                                        ? "border-neon-cyan bg-cyan-500/15 text-neon-cyan"
                                                        : "border-white/10 bg-black/85 text-white"
                                                }`}
                                            >
                                                <Radio className="h-3.5 w-3.5" />
                                                Amy
                                            </button>
                                        </div>

                                        {compactPanel && (
                                            <div className="pointer-events-none absolute bottom-[calc(100%+0.75rem)] left-1/2 z-[90] w-[min(100%,28rem)] -translate-x-1/2">
                                                <div ref={compactPanelRef} className="pointer-events-auto relative flex justify-center">
                                                    <button
                                                        type="button"
                                                        onClick={closeCompactPanel}
                                                        className="absolute -top-3 right-0 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/85 text-gray-300 shadow-[0_6px_18px_rgba(0,0,0,0.45)] transition-colors hover:border-white/25 hover:text-white"
                                                        aria-label="Close dock panel"
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                    {compactPanel === "player" ? <MiniPlayer /> : <AmyGuidePanel />}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-end justify-between gap-4 px-4 pb-4">
                                        <div className="min-w-0 shrink">
                                            <MiniPlayer />
                                        </div>
                                        <div className="min-w-0 shrink">
                                            <AmyGuidePanel />
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                </FitCanvas>
            </AmyGuideProvider>
        </ResponsiveShell>
    );
}
