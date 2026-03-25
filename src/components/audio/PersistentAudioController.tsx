"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { soundManager } from "@/lib/soundManager";

export default function PersistentAudioController() {
    const pathname = usePathname();

    useEffect(() => {
        soundManager.init();
    }, []);

    useEffect(() => {
        if (!pathname) return;
        const inMission = Boolean(pathname?.startsWith("/game/") && !pathname?.endsWith("/summary"));
        const isSilentRoute = pathname === "/" || pathname.startsWith("/api/");
        const nextScene = isSilentRoute ? "silent" : (inMission ? "intense" : "default");

        soundManager.setMusicScene(nextScene);
    }, [pathname]);

    return null;
}
