"use client";

import Link from "next/link";
import { ArrowLeft, Volume2, Monitor, Bell, VolumeX } from "lucide-react";
import { useState, useEffect } from "react";
import { soundManager } from "@/lib/soundManager";

export default function SettingsPage() {
    const [volume, setVolume] = useState(70);
    const [soundEnabled, setSoundEnabled] = useState(true);

    useEffect(() => {
        setSoundEnabled(soundManager.enabled);
        setVolume(Math.round(soundManager.volume * 100));
    }, []);

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = Number(e.target.value);
        setVolume(newVolume);
        soundManager.setVolume(newVolume / 100);
    };

    const handleSoundToggle = () => {
        const newState = soundManager.toggle();
        setSoundEnabled(newState);
    };

    return (
        <div className="min-h-full flex items-center justify-center p-4 bg-space-void relative">
            <div className="fixed top-6 left-8 z-50">
                <Link href="/menu" className="flex items-center text-neon-cyan hover:text-white transition-colors glass-panel px-4 py-2 rounded-full">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Bridge
                </Link>
            </div>

            <div className="w-full max-w-2xl glass-panel p-8 rounded-2xl">
                <header className="flex items-center mb-8 pb-4 border-b border-white/10">
                    <h1 className="text-2xl font-bold tracking-widest text-white">SYSTEM CONFIGURATION</h1>
                </header>

                <div className="space-y-8">
                    {/* Audio */}
                    <div className="space-y-4">
                        <h3 className="text-neon-blue font-bold flex items-center upper"><Volume2 className="mr-2" /> Audio Levels</h3>
                        <div className="flex items-center gap-4">
                            <span className="text-sm w-12 text-gray-400">Master</span>
                            <input
                                type="range"
                                min="0" max="100"
                                value={volume}
                                onChange={handleVolumeChange}
                                className="w-full accent-neon-cyan bg-gray-700 h-1 appearance-none rounded"
                            />
                            <span className="w-8 text-right font-mono text-neon-cyan">{volume}%</span>
                        </div>

                        {/* Sound Toggle */}
                        <div className="flex items-center justify-between p-4 bg-white/5 rounded border border-white/5">
                            <div className="flex items-center gap-3">
                                {soundEnabled ? <Volume2 className="h-5 w-5 text-neon-cyan" /> : <VolumeX className="h-5 w-5 text-gray-500" />}
                                <span className="text-sm text-gray-300">Sound Effects</span>
                            </div>
                            <button
                                onClick={handleSoundToggle}
                                className={`w-12 h-6 rounded-full transition-colors relative ${soundEnabled ? 'bg-neon-cyan/20' : 'bg-gray-700'} border ${soundEnabled ? 'border-neon-cyan' : 'border-gray-600'}`}
                            >
                                <div
                                    className={`h-5 w-5 rounded-full transition-all absolute top-0.5 ${soundEnabled ? 'left-7' : 'left-0.5'} bg-neon-cyan`}
                                />
                            </button>
                        </div>
                    </div>

                    {/* Graphics */}
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
    );
}
