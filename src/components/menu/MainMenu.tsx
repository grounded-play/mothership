"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Play, User, Settings, LogOut, ShoppingBag, Dices, Users } from "lucide-react";
import { signOut } from "next-auth/react";
import { soundManager } from "@/lib/soundManager";

export default function MainMenu() {
    const router = useRouter();
    const lastHoveredItemRef = useRef<string | null>(null);

    const menuItems = [
        {
            label: "Mission Control",
            icon: Play,
            action: () => router.push("/lobby/browse"),
            disabled: false,
            description: "Join Runs or Start Your Own",
            sound: { suit: "COMMAND", rank: 7 },
        },
        {
            label: "Character",
            icon: User,
            action: () => router.push("/character/view"),
            disabled: false,
            description: "View Service Record",
            sound: { suit: "BIOTECH", rank: 5 },
        },
        {
            label: "Marketplace",
            icon: ShoppingBag,
            action: () => router.push("/marketplace"),
            disabled: false,
            description: "Galactic Trade Network",
            sound: { suit: "PLASMA", rank: 6 },
        },
        {
            label: "3D Printer",
            icon: Dices,
            action: () => router.push("/printer"),
            disabled: false,
            description: "Weapon Fabrication",
            sound: { suit: "VOID", rank: 4 },
        },
        {
            label: "Roster",
            icon: Users, // Make sure to import Users
            action: () => router.push("/roster"),
            disabled: false,
            description: "Active Personnel",
            sound: { suit: "COMMAND", rank: 3 },
        },
        {
            label: "Settings",
            icon: Settings,
            action: () => router.push("/settings"),
            disabled: false,
            description: "System Configuration",
            sound: { suit: "ANOMALY", rank: 2 },
        },
    ];

    useEffect(() => {
        soundManager.init();
    }, []);

    const handleMenuHover = (label: string) => {
        if (lastHoveredItemRef.current === label) return;
        lastHoveredItemRef.current = label;
        soundManager.cardSelect();
    };

    const handleMenuLeave = () => {
        lastHoveredItemRef.current = null;
    };

    const handleMenuClick = (action: () => void, sound?: { suit: string; rank: number }) => {
        soundManager.cardPlay(sound, 1);
        action();
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-full p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-lg glass-panel p-8 rounded-2xl border-neon-blue/30"
            >
                <div className="text-center mb-10">
                    <h2 className="text-4xl font-bold tracking-widest text-white mb-2 neon-text">
                        MAIN MENU
                    </h2>
                    <div className="h-0.5 w-24 bg-neon-cyan mx-auto rounded-full shadow-[0_0_10px_#00f3ff]" />
                </div>

                <div className="space-y-4">
                    {menuItems.map((item) => (
                        <motion.div
                            key={item.label}
                            whileHover={{ scale: 1.02, x: 5 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            <button
                                onClick={() => handleMenuClick(item.action, item.sound)}
                                onMouseEnter={() => handleMenuHover(item.label)}
                                onFocus={() => handleMenuHover(item.label)}
                                onMouseLeave={handleMenuLeave}
                                onBlur={handleMenuLeave}
                                disabled={item.disabled}
                                className={`w-full group relative flex items-center p-4 rounded-lg border transition-all duration-300 ${item.disabled
                                    ? "border-gray-800 bg-gray-900/50 opacity-50 cursor-not-allowed"
                                    : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-neon-cyan/50 hover:shadow-[0_0_15px_rgba(0,243,255,0.2)]"
                                    }`}
                            >
                                <div
                                    className={`p-3 rounded-md mr-4 transition-colors ${item.disabled
                                        ? "bg-gray-800 text-gray-600"
                                        : "bg-black/40 text-neon-cyan group-hover:text-white group-hover:bg-neon-cyan/20"
                                        }`}
                                >
                                    <item.icon className="w-6 h-6" />
                                </div>
                                <div className="text-left">
                                    <div
                                        className={`font-bold text-lg tracking-wide ${item.disabled
                                            ? "text-gray-500"
                                            : "text-white group-hover:text-neon-cyan"
                                            }`}
                                    >
                                        {item.label}
                                    </div>
                                    <div className="text-xs text-gray-500 uppercase tracking-wider">
                                        {item.description}
                                    </div>
                                </div>

                                {!item.disabled && (
                                    <div className="absolute right-4 opacity-0 group-hover:opacity-100 transition-opacity text-neon-cyan">
                                        ▶
                                    </div>
                                )}
                            </button>
                        </motion.div>
                    ))}
                </div>

                <div className="mt-12 pt-8 border-t border-white/10 flex justify-center">
                    <Button
                        variant="ghost"
                        onMouseEnter={() => handleMenuHover("Disconnect")}
                        onFocus={() => handleMenuHover("Disconnect")}
                        onMouseLeave={handleMenuLeave}
                        onBlur={handleMenuLeave}
                        onClick={() => {
                            soundManager.actionFail();
                            signOut({ callbackUrl: "/" });
                        }}
                        className="text-red-400 hover:text-red-300 hover:bg-red-950/20"
                    >
                        <LogOut className="mr-2 h-4 w-4" /> Disconnect
                    </Button>
                </div>
            </motion.div>
        </div>
    );
}
