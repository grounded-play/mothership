"use client";

import Link from "next/link";
import { ArrowLeft, Monitor } from "lucide-react";
import AudioSettingsPanel from "@/components/audio/AudioSettingsPanel";
import AutoFitViewport from "@/components/layout/AutoFitViewport";

export default function SettingsPage() {
    return (
        <div className="relative flex h-full min-h-0 flex-col bg-space-void px-4 pb-4 pt-4 sm:px-5 sm:pb-5 sm:pt-4 xl:px-6">
            <div className="fixed left-4 top-4 z-50 sm:left-8 sm:top-6">
                <Link href="/menu" className="flex items-center text-neon-cyan hover:text-white transition-colors glass-panel px-4 py-2 rounded-full">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Bridge
                </Link>
            </div>

            <div className="mx-auto flex h-full min-h-0 w-full max-w-[1080px] flex-col">
                <AutoFitViewport contentKey="settings">
                    <div className="h-[590px] min-w-[840px] w-full">
                        <div className="glass-panel h-full rounded-[26px] p-5">
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <AudioSettingsPanel />
                                </div>

                                <div className="space-y-3">
                                    <h3 className="text-neon-magenta font-bold flex items-center upper"><Monitor className="mr-2" /> Display</h3>
                                    <div className="flex items-center justify-between rounded border border-white/5 bg-white/5 p-3.5">
                                        <span>High Contrast HUD</span>
                                        <div className="w-12 h-6 bg-neon-magenta/20 rounded-full relative cursor-pointer border border-neon-magenta">
                                            <div className="h-4 w-4 bg-neon-magenta rounded-full absolute top-1 right-1" />
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-2 text-center">
                                    <p className="text-xs text-gray-500">MOTHERSHIP OS v1.0.4 // BUILD 9942</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </AutoFitViewport>
            </div>
        </div>
    );
}
