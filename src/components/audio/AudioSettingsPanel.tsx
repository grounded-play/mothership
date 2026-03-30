"use client";

import { useEffect, useState } from "react";
import { Check, SlidersHorizontal, Volume2, VolumeX } from "lucide-react";
import { DEFAULT_AUDIO_SETTINGS, soundManager, type AudioSettingsSnapshot } from "@/lib/soundManager";

type AudioSettingsPanelProps = {
    compact?: boolean;
};

type ToggleCardProps = {
    label: string;
    description: string;
    enabled: boolean;
    onClick: () => void;
    compact?: boolean;
};

type SliderRowProps = {
    label: string;
    value: number;
    onChange: (value: number) => void;
    compact?: boolean;
};

function ToggleCard({ label, description, enabled, onClick, compact = false }: ToggleCardProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-xl border text-left transition-colors ${
                enabled
                    ? "border-neon-cyan/50 bg-neon-cyan/10"
                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
            } ${compact ? "p-3" : "p-3.5"}`}
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className={`font-bold uppercase tracking-[0.22em] ${compact ? "text-[10px]" : "text-xs"} ${enabled ? "text-neon-cyan" : "text-white"}`}>
                        {label}
                    </div>
                    <div className={`${compact ? "mt-1 text-[10px]" : "mt-2 text-xs"} text-gray-400`}>
                        {description}
                    </div>
                </div>
                <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                    enabled ? "border-neon-cyan bg-neon-cyan/20 text-neon-cyan" : "border-gray-600 text-transparent"
                }`}>
                    <Check className="h-3.5 w-3.5" />
                </div>
            </div>
        </button>
    );
}

function SliderRow({ label, value, onChange, compact = false }: SliderRowProps) {
    return (
        <div className={`rounded-lg border border-white/10 bg-white/5 ${compact ? "p-3" : "p-3.5"}`}>
            <div className={`mb-2 flex items-center justify-between ${compact ? "text-xs" : "text-sm"}`}>
                <span className="uppercase tracking-[0.2em] text-gray-300">{label}</span>
                <span className="font-mono text-neon-cyan">{value}%</span>
            </div>
            <input
                type="range"
                min="0"
                max="100"
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                className="h-1 w-full appearance-none rounded bg-gray-700 accent-neon-cyan"
            />
        </div>
    );
}

export default function AudioSettingsPanel({ compact = false }: AudioSettingsPanelProps) {
    const [settings, setSettings] = useState<AudioSettingsSnapshot>(DEFAULT_AUDIO_SETTINGS);

    useEffect(() => {
        soundManager.init();
        setSettings(soundManager.getSettingsSnapshot());
        return soundManager.subscribe(setSettings);
    }, []);

    const updateAndPreview = (update: () => void, shouldPreview = false) => {
        update();
        if (shouldPreview) {
            window.setTimeout(() => soundManager.cardSelect(), 0);
        }
    };

    return (
        <div className={compact ? "space-y-4" : "space-y-5"}>
            <div className="flex items-center gap-3">
                {settings.sfxEnabled && settings.masterEnabled ? (
                    <Volume2 className={`text-neon-cyan ${compact ? "h-5 w-5" : "h-6 w-6"}`} />
                ) : (
                    <VolumeX className={`text-gray-500 ${compact ? "h-5 w-5" : "h-6 w-6"}`} />
                )}
                <div>
                    <div className={`font-bold uppercase tracking-[0.3em] text-neon-cyan ${compact ? "text-[10px]" : "text-xs"}`}>
                        Audio Matrix
                    </div>
                    <div className={`${compact ? "text-[10px]" : "text-xs"} text-gray-500`}>
                        Deck loop runs on authenticated screens. Mission pages crossfade to the intense bed and back out on exit.
                    </div>
                </div>
            </div>

            <div className={`grid ${compact ? "grid-cols-1 gap-3" : "grid-cols-2 gap-2.5 xl:grid-cols-3"}`}>
                <ToggleCard
                    compact={compact}
                    label="Master"
                    description="Hard kill for all music and SFX layers."
                    enabled={settings.masterEnabled}
                    onClick={() => updateAndPreview(() => soundManager.setMasterEnabled(!settings.masterEnabled), !settings.masterEnabled && settings.sfxEnabled)}
                />
                <ToggleCard
                    compact={compact}
                    label="Music"
                    description="Loop the ambient bridge bed and mission-intense mix."
                    enabled={settings.musicEnabled}
                    onClick={() => soundManager.setMusicEnabled(!settings.musicEnabled)}
                />
                <ToggleCard
                    compact={compact}
                    label="SFX"
                    description="Card tones, footsteps, locks, failures, and scanner cues."
                    enabled={settings.sfxEnabled}
                    onClick={() => updateAndPreview(() => soundManager.setSfxEnabled(!settings.sfxEnabled), !settings.sfxEnabled && settings.masterEnabled)}
                />
            </div>

            <div className="space-y-3">
                <div className={`flex items-center gap-2 uppercase tracking-[0.28em] text-gray-400 ${compact ? "text-[10px]" : "text-xs"}`}>
                    <SlidersHorizontal className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
                    Levels
                </div>
                <SliderRow
                    compact={compact}
                    label="Master"
                    value={Math.round(settings.masterVolume * 100)}
                    onChange={(value) => soundManager.setMasterVolume(value / 100)}
                />
                <SliderRow
                    compact={compact}
                    label="Music"
                    value={Math.round(settings.musicVolume * 100)}
                    onChange={(value) => soundManager.setMusicVolume(value / 100)}
                />
                <SliderRow
                    compact={compact}
                    label="SFX"
                    value={Math.round(settings.sfxVolume * 100)}
                    onChange={(value) => soundManager.setSfxVolume(value / 100)}
                />
            </div>
        </div>
    );
}
