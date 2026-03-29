/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Radio, Sparkles } from "lucide-react";
import { useAmyGuide, type AmyGuideTransmission } from "@/components/guide/AmyGuideContext";

const AMY_PORTRAITS = {
    idle: "/amy/guide-idle.svg",
    talkA: "/amy/guide-talk-1.svg",
    talkB: "/amy/guide-talk-2.svg",
} as const;

const TYPE_SPEED_MS = 18;
const ROTATE_MS = 14000;
const TALK_FRAME_MS = 160;

function getGuideMessages(pathname: string | null): AmyGuideTransmission[] {
    if (!pathname) {
        return [];
    }

    if (pathname.startsWith("/game/")) {
        return [
            {
                kind: "guide",
                title: "Mission Rhythm",
                text: "Sweep the room before you commit. Hallway intel should grow out of the current room scan, not leak ahead of it."
            },
            {
                kind: "warning",
                title: "Timer Discipline",
                text: "If mission time expires, the run should collapse immediately. Spend cards early enough to leave yourself a recovery line."
            },
            {
                kind: "lore",
                title: "Signal Archive",
                text: "Celeste Renaud heard the deep-space blueprint signal first. Father Elias kept telling the crew that language has to be grounded in something real, or it becomes noise."
            },
        ];
    }

    if (pathname.startsWith("/lobby")) {
        return [
            {
                kind: "guide",
                title: "Preflight",
                text: "Lock loadouts here. Once you breach the hull, your cards and your route planning matter more than brute force."
            },
            {
                kind: "lore",
                title: "Amy's Briefing",
                text: "I am Amy, shipboard guide and tutorial relay. I keep the crew focused on extraction math, route clarity, and what the signal is trying to teach us."
            },
        ];
    }

    if (pathname.startsWith("/roster") || pathname.startsWith("/character")) {
        return [
            {
                kind: "guide",
                title: "Personnel Dossiers",
                text: "Use the roster to read service history, stats, and gear context before you recruit anyone into the next breach."
            },
            {
                kind: "lore",
                title: "Amy Profile",
                text: "Amy is no longer just another marine entry. Treat her as the shipwide comms guide that narrates systems, warnings, and recovered lore."
            },
        ];
    }

    if (pathname.startsWith("/marketplace") || pathname.startsWith("/printer")) {
        return [
            {
                kind: "guide",
                title: "Fabrication Channel",
                text: "Scrap into gear, credits into leverage. Keep the printer healthy and do not let your backpack turn into dead weight."
            },
            {
                kind: "lore",
                title: "Recovered Doctrine",
                text: "Elias taught that every declaration should be based in truth, spirit, or the subject at hand. The crew started repeating that whenever the signal bent their words."
            },
        ];
    }

    if (pathname.startsWith("/settings")) {
        return [
            {
                kind: "guide",
                title: "Systems Calibration",
                text: "Tune audio, keep the bridge readable, and make the command surfaces clear enough to survive a rushed decision."
            },
        ];
    }

    return [
        {
            kind: "guide",
            title: "Bridge Comms",
            text: "I am Amy on shipwide comms. I will keep route guidance, lore fragments, and system warnings cycling while you move through the ship."
        },
        {
            kind: "lore",
            title: "Blueprint Signal",
            text: "The first vessel was built from blueprints hidden in the mothership signal. That discovery changed science, faith, and every crew that followed."
        },
    ];
}

const KIND_STYLES: Record<AmyGuideTransmission["kind"], string> = {
    guide: "border-neon-cyan/40 bg-cyan-500/10 text-neon-cyan",
    lore: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
    warning: "border-amber-500/40 bg-amber-500/10 text-amber-300",
};

export default function AmyGuidePanel({ layout = "dock" }: { layout?: "dock" | "sidebar" }) {
    const pathname = usePathname();
    const { override } = useAmyGuide();
    const hasOverrideMessages = Boolean(override?.messages?.length);
    const messages = useMemo(() => {
        if (hasOverrideMessages) {
            return override?.messages ?? [];
        }
        return getGuideMessages(pathname);
    }, [hasOverrideMessages, override?.messages, pathname]);
    const [index, setIndex] = useState(0);
    const [visibleText, setVisibleText] = useState("");
    const [isTalking, setIsTalking] = useState(false);
    const [talkFrame, setTalkFrame] = useState<0 | 1>(0);
    const lastMessageKeyRef = useRef<string | null>(null);

    useEffect(() => {
        setIndex(0);
    }, [pathname, override?.source]);

    useEffect(() => {
        if (hasOverrideMessages || messages.length <= 1) return;
        const interval = window.setInterval(() => {
            setIndex((current) => (current + 1) % messages.length);
        }, ROTATE_MS);
        return () => window.clearInterval(interval);
    }, [hasOverrideMessages, messages]);

    useEffect(() => {
        setIndex((current) => {
            if (messages.length === 0) return 0;
            return Math.min(current, messages.length - 1);
        });
    }, [messages.length]);

    const current = messages[index] ?? null;
    const currentMessageKey = current ? `${current.kind}:${current.title}:${current.text}` : null;

    useEffect(() => {
        if (!current) {
            setVisibleText("");
            setIsTalking(false);
            lastMessageKeyRef.current = null;
            return;
        }

        if (hasOverrideMessages) {
            setVisibleText(current.text);
            const changed = lastMessageKeyRef.current !== currentMessageKey;
            lastMessageKeyRef.current = currentMessageKey;
            if (changed) {
                setIsTalking(true);
                const timeout = window.setTimeout(() => setIsTalking(false), 900);
                return () => window.clearTimeout(timeout);
            }
            setIsTalking(false);
            return;
        }

        setVisibleText("");
        setIsTalking(true);
        let cursor = 0;
        const interval = window.setInterval(() => {
            cursor += 1;
            setVisibleText(current.text.slice(0, cursor));
            if (cursor >= current.text.length) {
                window.clearInterval(interval);
                window.setTimeout(() => setIsTalking(false), 280);
            }
        }, TYPE_SPEED_MS);
        lastMessageKeyRef.current = currentMessageKey;

        return () => window.clearInterval(interval);
    }, [current, currentMessageKey, hasOverrideMessages]);

    useEffect(() => {
        if (!isTalking) {
            setTalkFrame(0);
            return;
        }
        const interval = window.setInterval(() => {
            setTalkFrame((frame) => (frame === 0 ? 1 : 0));
        }, TALK_FRAME_MS);
        return () => window.clearInterval(interval);
    }, [isTalking]);

    if (!pathname || pathname === "/" || pathname.startsWith("/api/") || !current) {
        return null;
    }

    const portraitSrc = !isTalking ? AMY_PORTRAITS.idle : talkFrame === 0 ? AMY_PORTRAITS.talkA : AMY_PORTRAITS.talkB;
    const sidebar = layout === "sidebar";

    return (
        <div className={`relative flex max-w-full gap-3 rounded-2xl border border-white/10 bg-black/88 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl ${
            sidebar ? "w-full items-start px-3 py-3" : "w-[320px] items-start px-3 py-3 sm:w-[380px] sm:px-3.5"
        }`}>
            <div className={`relative shrink-0 overflow-hidden rounded-xl border border-neon-cyan/30 bg-cyan-500/5 shadow-[0_0_20px_rgba(34,211,238,0.15)] ${
                sidebar ? "h-16 w-16" : "h-12 w-12 sm:h-16 sm:w-16"
            }`}>
                <img src={portraitSrc} alt="Amy guide portrait" className="h-full w-full object-cover" />
                <div className="absolute inset-x-1 bottom-1 rounded-full border border-white/10 bg-black/70 px-1.5 py-0.5 text-center text-[7px] font-bold uppercase tracking-[0.22em] text-neon-cyan">
                    {isTalking ? "Live" : "Standby"}
                </div>
            </div>

            <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-start justify-between gap-2">
                    <div className={`flex items-center gap-1 uppercase tracking-[0.22em] text-neon-cyan ${sidebar ? "text-[10px]" : "text-[9px] sm:gap-1.5 sm:text-[10px] sm:tracking-[0.24em]"}`}>
                        <Radio className="h-3 w-3" />
                        Amy // Ship Comms
                    </div>
                    <div className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] ${KIND_STYLES[current.kind]}`}>
                        {current.kind}
                    </div>
                </div>

                <div className={`font-bold text-white ${sidebar ? "text-sm leading-tight sm:text-base" : "text-sm leading-tight sm:text-base"}`}>
                    {current.title}
                </div>
                <div
                    className={`mt-1 leading-relaxed text-gray-300 ${sidebar ? "max-h-24 overflow-y-auto pr-1 text-[11px] custom-scrollbar sm:max-h-28" : "max-h-20 overflow-y-auto pr-1 text-[10px] custom-scrollbar sm:max-h-24 sm:text-[11px]"}`}
                >
                    {visibleText}
                    {isTalking && <span className="ml-1 inline-block h-2 w-1 animate-pulse bg-neon-cyan align-middle" />}
                </div>
            </div>

            <div className="flex shrink-0 flex-col gap-1">
                <button
                    type="button"
                    onClick={() => setIndex((currentIndex) => (currentIndex - 1 + messages.length) % messages.length)}
                    className={`flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-colors hover:border-white/25 hover:bg-white/10 ${
                        sidebar ? "h-7 w-7" : "h-6 w-6 sm:h-7 sm:w-7"
                    }`}
                    aria-label="Previous transmission"
                >
                    <ChevronLeft className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                </button>
                <button
                    type="button"
                    onClick={() => setIndex((currentIndex) => (currentIndex + 1) % messages.length)}
                    className={`flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-colors hover:border-white/25 hover:bg-white/10 ${
                        sidebar ? "h-7 w-7" : "h-6 w-6 sm:h-7 sm:w-7"
                    }`}
                    aria-label="Next transmission"
                >
                    <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                </button>
            </div>

            <div className="pointer-events-none absolute right-8 top-2 text-fuchsia-400/50 sm:right-10">
                <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </div>
        </div>
    );
}
