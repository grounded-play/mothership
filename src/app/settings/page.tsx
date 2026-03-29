"use client";

import Link from "next/link";
import { ArrowLeft, Monitor } from "lucide-react";
import AudioSettingsPanel from "@/components/audio/AudioSettingsPanel";

export default function SettingsPage() {
    return (
        <div className="relative flex h-full min-h-0 flex-col bg-space-void px-4 pb-4 pt-20 sm:px-6 sm:pb-6 sm:pt-24 xl:px-8">
            <div className="fixed left-4 top-4 z-50 sm:left-8 sm:top-6">
                <Link href="/menu" className="flex items-center text-neon-cyan hover:text-white transition-colors glass-panel px-4 py-2 rounded-full">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Bridge
                </Link>
            </div>

            <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col">
                <header className="mb-6 flex shrink-0 items-center border-b border-white/10 pb-4">
                    <h1 className="text-2xl font-bold tracking-widest text-white">SYSTEM CONFIGURATION</h1>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar hud-scrollbar pr-1">
                    <div className="glass-panel rounded-2xl p-6 sm:p-8">
                        <div className="space-y-8">
                            <div className="space-y-4">
                                <AudioSettingsPanel />
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-neon-magenta font-bold flex items-center upper"><Monitor className="mr-2" /> Display</h3>
                                <div className="flex justify-between items-center p-4 bg-white/5 rounded border border-white/5">
                                    <span>High Contrast HUD</span>
                                    <div className="w-12 h-6 bg-neon-magenta/20 rounded-full relative cursor-pointer border border-neon-magenta">
                                        <div className="h-4 w-4 bg-neon-magenta rounded-full absolute top-1 right-1" />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 text-center">
                                <p className="text-xs text-gray-500">MOTHERSHIP OS v1.0.4 // BUILD 9942</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
