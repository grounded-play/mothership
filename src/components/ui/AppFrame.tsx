"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
    Crosshair,
    Grid2x2,
    Radio,
    Rocket,
    Settings2,
    Shield,
    ShoppingBag,
    User,
    Users,
    Volume2,
    X,
    Zap,
} from "lucide-react";
import PersistentAudioController from "@/components/audio/PersistentAudioController";
import { AmyGuideProvider } from "@/components/guide/AmyGuideContext";
import MiniPlayer from "@/components/audio/MiniPlayer";
import AmyGuidePanel from "@/components/guide/AmyGuidePanel";
import ResponsiveShell from "@/components/layout/ResponsiveShell";
import FitCanvas from "@/components/layout/FitCanvas";
import { AppChromeContext, type AppChromeOverride } from "@/components/ui/AppChromeContext";
import { usePathname } from "next/navigation";

const APP_STAGE_WIDTH = 1440;
const APP_STAGE_HEIGHT = 810;
type CompactPanel = "player" | "guide";

const GAME_ROUTE_RE = /^\/game\/[^/]+$/;
const SUMMARY_ROUTE_RE = /^\/game\/[^/]+\/summary$/;
const LOBBY_ROUTE_RE = /^\/lobby\/[^/]+$/;

type RouteMeta = {
    title: string;
    icon: LucideIcon;
};

function getRouteMeta(pathname: string | null): RouteMeta | null {
    if (!pathname || pathname === "/" || pathname.startsWith("/api/")) return null;
    if (pathname === "/menu") return { title: "Main Menu", icon: Grid2x2 };
    if (pathname === "/roster") return { title: "Active Roster", icon: Users };
    if (pathname === "/marketplace") return { title: "Galactic Market", icon: ShoppingBag };
    if (pathname === "/printer") return { title: "Matter Fabricator", icon: Zap };
    if (pathname === "/settings") return { title: "System Configuration", icon: Settings2 };
    if (pathname === "/character/view") return { title: "Character Record", icon: User };
    if (pathname === "/character/create") return { title: "Character Creator", icon: User };
    if (pathname === "/lobby/browse") return { title: "Mission Control", icon: Crosshair };
    if (LOBBY_ROUTE_RE.test(pathname)) return { title: "Launch Bay", icon: Rocket };
    if (SUMMARY_ROUTE_RE.test(pathname)) return { title: "Post-Mission Analysis", icon: Shield };
    if (GAME_ROUTE_RE.test(pathname)) return { title: "Mission Deck", icon: Crosshair };
    return null;
}

function isFittedRoute(pathname: string | null) {
    if (!pathname) return false;
    return pathname === "/menu"
        || pathname === "/roster"
        || pathname === "/marketplace"
        || pathname === "/printer"
        || pathname === "/settings"
        || pathname === "/character/view"
        || pathname === "/character/create"
        || pathname === "/lobby/browse"
        || SUMMARY_ROUTE_RE.test(pathname)
        || GAME_ROUTE_RE.test(pathname);
}

function shouldShowBridgeTime(pathname: string | null) {
    return Boolean(pathname && (GAME_ROUTE_RE.test(pathname) || SUMMARY_ROUTE_RE.test(pathname)));
}

export default function AppFrame({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const showDock = Boolean(pathname && pathname !== "/" && !pathname.startsWith("/api/"));
    const routeMeta = getRouteMeta(pathname);
    const fitContent = isFittedRoute(pathname);
    const showBridgeTime = shouldShowBridgeTime(pathname);
    const useSidebarComms = pathname === "/menu";
    const [isCompactViewport, setIsCompactViewport] = useState(false);
    const [bridgeTimeLabel, setBridgeTimeLabel] = useState("");
    const [chromeOverride, setChromeOverride] = useState<AppChromeOverride | null>(null);
    const [compactPanelState, setCompactPanelState] = useState<{ panel: CompactPanel | null; pathname: string | null }>({
        panel: null,
        pathname: null,
    });
    const compactLauncherRef = useRef<HTMLDivElement | null>(null);
    const compactPanelRef = useRef<HTMLDivElement | null>(null);
    const routeKey = pathname ?? null;
    const compactPanel = compactPanelState.pathname === routeKey ? compactPanelState.panel : null;
    const RouteIcon = routeMeta?.icon;
    const effectiveTitle = chromeOverride?.title ?? routeMeta?.title;
    const effectiveIcon = chromeOverride?.icon ?? (RouteIcon ? <RouteIcon className={`${isCompactViewport ? "h-3 w-3" : "h-3.5 w-3.5"} shrink-0 text-neon-cyan`} /> : null);
    const titleMaxWidthClassName = chromeOverride?.titleMaxWidthClassName ?? "max-w-[52vw]";
    const statusItems = chromeOverride?.statusItems;
    const rightItems = chromeOverride?.rightItems;
    const showBridgeTimeChip = showBridgeTime && bridgeTimeLabel && !isCompactViewport && !chromeOverride?.hideBridgeTime;

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
            setIsCompactViewport(coarsePointer || width < 1360 || height < 820);
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
        if (!showBridgeTime) {
            setBridgeTimeLabel("");
            return;
        }

        const formatter = new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });

        const updateBridgeTime = () => {
            setBridgeTimeLabel(formatter.format(new Date()).toUpperCase());
        };

        updateBridgeTime();
        const interval = window.setInterval(updateBridgeTime, 30000);
        return () => window.clearInterval(interval);
    }, [showBridgeTime]);

    useEffect(() => {
        setChromeOverride(null);
    }, [pathname]);

    useEffect(() => {
        if (!compactPanel) return;

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
    }, [compactPanel, routeKey]);

    return (
        <ResponsiveShell>
            <AmyGuideProvider>
                <AppChromeContext.Provider value={{ override: chromeOverride, setOverride: setChromeOverride }}>
                    <PersistentAudioController />
                    <FitCanvas width={APP_STAGE_WIDTH} height={APP_STAGE_HEIGHT} maxScale={2.4} padding={10}>
                        <div className="relative h-full w-full overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-[0_0_80px_rgba(0,0,0,0.92)]">
                            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,243,255,0.08),transparent_38%),radial-gradient(circle_at_bottom,rgba(255,0,255,0.05),transparent_30%)]" />
                            <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-white/5" />
                            <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-white/5" />

                            <div
                                className="grid h-full w-full"
                                style={{
                                    gridTemplateRows: showDock ? "58px minmax(0,1fr)" : "minmax(0,1fr)",
                                }}
                            >
                                {showDock && (
                                    <div className="relative z-[40] flex items-center justify-between gap-3 px-4 pt-3">
                                        <div className="relative z-[2] flex min-w-0 max-w-[42%] items-center gap-2 overflow-hidden">
                                            {statusItems}
                                        </div>

                                        {effectiveTitle && (
                                            <div className={`pointer-events-none absolute left-1/2 top-3 z-0 flex ${titleMaxWidthClassName} -translate-x-1/2 items-center gap-2 text-center`}>
                                                {effectiveIcon}
                                                <div className={`${isCompactViewport ? "text-[10px]" : "text-[12px]"} truncate font-bold uppercase tracking-[0.3em] text-white`}>
                                                    {effectiveTitle}
                                                </div>
                                            </div>
                                        )}

                                        <div className="relative z-[2] flex min-w-0 items-center justify-end gap-2">
                                            {rightItems}
                                            {showBridgeTimeChip && (
                                                <div className="rounded-full border border-cyan-500/20 bg-black/82 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-200 shadow-[0_10px_28px_rgba(0,0,0,0.4)]">
                                                    {bridgeTimeLabel}
                                                </div>
                                            )}

                                            {!useSidebarComms && (
                                                <div ref={compactLauncherRef} className="relative flex items-center justify-center gap-2 rounded-full border border-white/10 bg-black/88 px-2 py-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.48)] backdrop-blur-xl">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleCompactPanel("player")}
                                                        className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                                                            compactPanel === "player"
                                                                ? "border-neon-cyan bg-cyan-500/15 text-neon-cyan"
                                                                : "border-white/10 bg-black/70 text-white"
                                                        }`}
                                                        aria-label="Toggle audio panel"
                                                    >
                                                        <Volume2 className={`${isCompactViewport ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleCompactPanel("guide")}
                                                        className={`flex items-center gap-2 rounded-full border px-3 py-2 font-bold uppercase tracking-[0.22em] transition-colors ${
                                                            compactPanel === "guide"
                                                                ? "border-neon-cyan bg-cyan-500/15 text-neon-cyan"
                                                                : "border-white/10 bg-black/70 text-white"
                                                        } ${isCompactViewport ? "text-[10px]" : "text-[11px]"}`}
                                                    >
                                                        <Radio className="h-3.5 w-3.5" />
                                                        Amy
                                                    </button>

                                                    {compactPanel && (
                                                        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-[90]">
                                                            <div ref={compactPanelRef} className="relative flex justify-center">
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
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className={`relative min-h-0 ${fitContent ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden custom-scrollbar hud-scrollbar"}`}>
                                    {children}
                                </div>
                            </div>
                        </div>
                    </FitCanvas>
                </AppChromeContext.Provider>
            </AmyGuideProvider>
        </ResponsiveShell>
    );
}
