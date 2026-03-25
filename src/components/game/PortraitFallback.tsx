"use client";

import React from 'react';
import { User, Shield, Zap, Crosshair, Microscope } from 'lucide-react';

interface PortraitFallbackProps {
    characterClass?: string;
    className?: string;
}

export default function PortraitFallback({ characterClass, className = "" }: PortraitFallbackProps) {
    const cls = characterClass?.toLowerCase() || "unknown";

    const getIcon = () => {
        switch (cls) {
            case 'marine': return <Shield className="w-1/2 h-1/2 transition-transform duration-500 group-hover:scale-110" />;
            case 'scout': return <Crosshair className="w-1/2 h-1/2 transition-transform duration-500 group-hover:scale-110" />;
            case 'scientist': return <Microscope className="w-1/2 h-1/2 transition-transform duration-500 group-hover:scale-110" />;
            case 'engineer': return <Zap className="w-1/2 h-1/2 transition-transform duration-500 group-hover:scale-110" />;
            default: return <User className="w-1/2 h-1/2 transition-transform duration-500 group-hover:scale-110" />;
        }
    };

    const getColor = () => {
        switch (cls) {
            case 'marine': return 'text-green-500/40 shadow-[inset_0_0_20px_rgba(34,197,94,0.1)]';
            case 'scout': return 'text-purple-500/40 shadow-[inset_0_0_20px_rgba(168,85,247,0.1)]';
            case 'scientist': return 'text-red-500/40 shadow-[inset_0_0_20px_rgba(239,68,68,0.1)]';
            case 'engineer': return 'text-orange-500/40 shadow-[inset_0_0_20px_rgba(249,115,22,0.1)]';
            default: return 'text-cyan-500/40 shadow-[inset_0_0_20px_rgba(6,182,212,0.1)]';
        }
    };

    return (
        <div className={`group relative w-full h-full bg-black/60 flex items-center justify-center overflow-hidden rounded-md border border-white/5 ${getColor()} ${className}`}>
            {/* Gradients */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
            
            {/* Scanning Line Effect */}
            <div className="absolute inset-0 w-full h-[2px] bg-white/5 animate-[scan_4s_linear_infinite] top-0" style={{
                backgroundImage: 'linear-gradient(to right, transparent, rgba(255,255,255,0.2), transparent)'
            }} />

            {/* Icon */}
            <div className="relative z-10 flex flex-col items-center gap-2">
                {getIcon()}
                <span className="text-[8px] font-mono tracking-widest opacity-30 uppercase font-bold">
                    PENDING VISUALS
                </span>
            </div>

            {/* Grain/Noise Overlay */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
            
            <style jsx>{`
                @keyframes scan {
                    0% { top: 0%; opacity: 0; }
                    10% { opacity: 0.5; }
                    90% { opacity: 0.5; }
                    100% { top: 100%; opacity: 0; }
                }
            `}</style>
        </div>
    );
}
