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
        <div className="flex h-full w-full items-stretch justify-center">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="glass-panel flex h-full w-full max-w-[960px] flex-col rounded-[28px] border border-neon-blue/30 px-5 py-6 shadow-[0_24px_60px_rgba(0,0,0,0.4)] sm:px-7 sm:py-8 xl:max-w-[1120px] xl:px-10 xl:py-10"
            >
                <div className="mb-8 text-center sm:mb-10">
                    <h2 className="mb-3 text-4xl font-bold tracking-[0.18em] text-white neon-text sm:text-5xl xl:text-6xl">
                        MAIN MENU
                    </h2>
                    <div className="mx-auto h-1 w-28 rounded-full bg-neon-cyan shadow-[0_0_18px_#00f3ff] sm:w-36" />
                    <p className="mx-auto mt-4 max-w-2xl text-sm text-gray-400 sm:text-base xl:text-lg">
                        Route into missions, configure your rig, inspect personnel, and manage fabrication from a single bridge command surface.
                    </p>
                </div>

                <div className="grid flex-1 grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
                    {menuItems.map((item) => (
                        <motion.div
                            key={item.label}
                            whileHover={{ scale: 1.02, x: 5 }}
                            whileTap={{ scale: 0.98 }}
                            className="h-full"
                        >
                            <button
                                onClick={() => handleMenuClick(item.action, item.sound)}
                                onMouseEnter={() => handleMenuHover(item.label)}
                                onFocus={() => handleMenuHover(item.label)}
                                onMouseLeave={handleMenuLeave}
                                onBlur={handleMenuLeave}
                                disabled={item.disabled}
                                className={`group relative flex h-full min-h-[88px] w-full items-center rounded-2xl border p-4 transition-all duration-300 sm:min-h-[96px] sm:p-5 xl:min-h-[108px] xl:p-6 ${item.disabled
                                    ? "border-gray-800 bg-gray-900/50 opacity-50 cursor-not-allowed"
                                    : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-neon-cyan/50 hover:shadow-[0_0_15px_rgba(0,243,255,0.2)]"
                                    }`}
                            >
                                <div
                                    className={`mr-4 rounded-xl p-3.5 transition-colors sm:mr-5 sm:p-4 xl:mr-6 xl:p-[18px] ${item.disabled
                                        ? "bg-gray-800 text-gray-600"
                                        : "bg-black/40 text-neon-cyan group-hover:text-white group-hover:bg-neon-cyan/20"
                                        }`}
                                >
                                    <item.icon className="h-6 w-6 sm:h-7 sm:w-7 xl:h-8 xl:w-8" />
                                </div>
                                <div className="text-left">
                                    <div
                                        className={`font-bold tracking-wide sm:text-xl xl:text-2xl ${item.disabled
                                            ? "text-gray-500"
                                            : "text-white group-hover:text-neon-cyan"
                                            }`}
                                    >
                                        {item.label}
                                    </div>
                                    <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-gray-500 sm:text-xs xl:text-sm">
                                        {item.description}
                                    </div>
                                </div>

                                {!item.disabled && (
                                    <div className="absolute right-4 text-neon-cyan opacity-0 transition-opacity group-hover:opacity-100 sm:right-5">
                                        ▶
                                    </div>
                                )}
                            </button>
                        </motion.div>
                    ))}
                </div>

                <div className="mt-8 flex justify-center border-t border-white/10 pt-6 sm:mt-10 sm:pt-8">
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
                        className="text-sm text-red-400 hover:bg-red-950/20 hover:text-red-300 sm:text-base"
                    >
                        <LogOut className="mr-2 h-4 w-4" /> Disconnect
                    </Button>
                </div>
            </motion.div>
        </div>
    );
}
