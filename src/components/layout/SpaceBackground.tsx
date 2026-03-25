"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export default function SpaceBackground() {
    const [stars, setStars] = useState<{ id: number; top: string; left: string; size: number; duration: number }[]>([]);

    useEffect(() => {
        // Generate static star positions 
        const newStars = Array.from({ length: 150 }).map((_, i) => ({
            id: i,
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            size: Math.random() < 0.1 ? 2.5 : Math.random() < 0.4 ? 1.5 : 1, // Weighted size
            duration: Math.random() * 20 + 30, // 30-50s float duration
        }));
        setStars(newStars);
    }, []);

    return (
        <div className="fixed inset-0 z-[-1] overflow-hidden bg-space-void">
            {/* Deep Nebula Gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-space-void via-space-dark to-[#1a0b2e] opacity-80" />

            {/* Parallax Star Layers */}
            <div className="absolute inset-0 opacity-80 animate-[spin_240s_linear_infinite]">
                {/* We simulate movement by rotating a huge container very slowly, or we can use drift.
             Let's use simple CSS animation for drift on layers. */}
            </div>

            {/* Stars with individual twinkle and drift */}
            {stars.map((star) => (
                <motion.div
                    key={star.id}
                    className="absolute rounded-full bg-white opacity-40 shadow-[0_0_2px_white]"
                    style={{
                        top: star.top,
                        left: star.left,
                        width: star.size,
                        height: star.size,
                    }}
                    animate={{
                        x: [0, 100, 0], // Subtle horizontal drift
                        y: [0, 50, 0],  // Subtle vertical drift
                        opacity: [0.3, 0.8, 0.3], // Twinkle
                    }}
                    transition={{
                        x: { duration: star.duration, repeat: Infinity, ease: "linear" },
                        y: { duration: star.duration * 1.5, repeat: Infinity, ease: "linear" },
                        opacity: { duration: Math.random() * 3 + 2, repeat: Infinity, ease: "easeInOut" }
                    }}
                />
            ))}

            {/* Scanline/Grid Effect */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 mix-blend-overlay pointer-events-none"></div>

            {/* Vignette */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,black_100%)] opacity-40 pointer-events-none"></div>
        </div>
    );
}
