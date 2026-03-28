"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { User, Shield, Zap, Crosshair } from "lucide-react";
import { motion } from "framer-motion";

const classes = [
    { id: "marine", icon: Crosshair, desc: "Trained for combat and boarding actions." },
    { id: "android", icon: User, desc: "Synthetic lifeform with superior intellect." },
    { id: "scientist", icon: Zap, desc: "Expert in biology, genetics, and alien artifacts." },
    { id: "teamster", icon: Shield, desc: "Roughneck space trucker and heavy lifter." }
];

export default function CreateCharacterForm() {
    const router = useRouter();
    const [selectedClass, setSelectedClass] = useState("marine");
    const [isLoading, setIsLoading] = useState(false);

    const [features, setFeatures] = useState({
        hair: "",
        eyes: "",
        distinctions: ""
    });

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData(e.currentTarget);
        const name = formData.get("name") as string;

        try {
            // 1. Create Character first
            const res = await fetch("/api/character", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    class: selectedClass,
                    portrait: null // No portrait yet
                }),
            });

            if (res.ok) {
                const data = await res.json();
                const newCharId = data.character?.id;

                // 2. Automatically Queue visual generation if parameters provided
                if (newCharId && (features.hair || features.eyes || features.distinctions)) {
                    await fetch("/api/character/generate-art", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            characterId: newCharId,
                            class: selectedClass,
                            features: features.distinctions || "Standard", // Ensure some prompt
                            hair: features.hair,
                            eyes: features.eyes
                        }),
                    });

                    // Redirect to Printer to see queue
                    router.push("/printer");
                    router.refresh();
                } else {
                    // No visuals requested, go to menu
                    router.push("/menu");
                    router.refresh();
                }

            } else {
                console.error("Failed to create character");
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl w-full glass-panel p-8 rounded-2xl mx-auto"
        >
            <div className="space-y-6">
                <div className="text-left mb-4">
                    <h1 className="text-3xl font-bold text-white mb-2">IDENTITY REGISTRATION</h1>
                    <p className="text-neon-cyan/70 uppercase text-xs tracking-[0.2em]">{selectedClass} CLASS INTAKE</p>
                </div>

                {/* Lore Warning for Scientist Class */}
                {selectedClass === "scientist" && (
                    <div className="glass-panel p-4 rounded-lg border-l-2 border-neon-magenta">
                        <p className="text-[10px] text-neon-magenta/90 uppercase tracking-wider font-bold mb-1">
                            ⚠️ Class-Specific Lore
                        </p>
                        <p className="text-xs text-gray-300 leading-relaxed">
                            As a <span className="text-white font-bold">Scientist</span>, you are part of a legacy that began with
                            Dr. Aris Thorne—a signal physicist who received the Mothership transmission. She believed the signal was
                            a source of knowledge. She was wrong. The signal was a trap. Learn the truth in your service record.
                        </p>
                    </div>
                )}

                <form onSubmit={onSubmit} className="space-y-5">
                    <div className="space-y-2">
                        <label className="text-xs text-gray-400 uppercase tracking-wide">Codename</label>
                        <div className="relative">
                            <User className="absolute left-3 top-2.5 h-5 w-5 text-gray-500" />
                            <Input name="name" placeholder="Enter Character Name" className="pl-10" required maxLength={20} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-gray-400 uppercase tracking-wide">Specialization</label>
                        <div className="grid grid-cols-4 gap-2">
                            {classes.map((c) => (
                                <div
                                    key={c.id}
                                    onClick={() => setSelectedClass(c.id)}
                                    className={`cursor-pointer border rounded-md p-3 flex flex-col items-center gap-1 transition-all duration-300 ${selectedClass === c.id
                                        ? "bg-neon-cyan/20 border-neon-cyan"
                                        : "bg-black/40 border-white/10 hover:border-white/30"
                                        }`}
                                >
                                    <c.icon className={`h-5 w-5 ${selectedClass === c.id ? "text-neon-cyan" : "text-gray-500"}`} />
                                    <span className={`text-[9px] uppercase font-bold text-center ${selectedClass === c.id ? "text-white" : "text-gray-400"}`}>{c.id}</span>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500 h-4 text-center">
                            {classes.find(c => c.id === selectedClass)?.desc}
                        </p>
                    </div>

                    <div className="pt-4 border-t border-white/10 space-y-4">
                        <label className="text-xs text-neon-cyan/80 uppercase tracking-wide flex items-center gap-2">
                            <Zap className="w-3 h-3" /> Visual Parameters (Auto-Queued)
                        </label>
                        <p className="text-[10px] text-gray-500">
                            Leave blank for standard issue. Setup will queue a 3D Print job for your ID badge.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <Input
                                placeholder="Hair Style"
                                value={features.hair}
                                onChange={e => setFeatures({ ...features, hair: e.target.value })}
                                className="text-sm bg-black/20"
                            />
                            <Input
                                placeholder="Eye Color"
                                value={features.eyes}
                                onChange={e => setFeatures({ ...features, eyes: e.target.value })}
                                className="text-sm bg-black/20"
                            />
                        </div>
                        <Input
                            placeholder="Distinguishing Features (Scars, Cybernetics...)"
                            value={features.distinctions}
                            onChange={e => setFeatures({ ...features, distinctions: e.target.value })}
                            className="text-sm bg-black/20"
                        />
                    </div>

                    <Button type="submit" disabled={isLoading} className="w-full h-12 text-lg mt-4 bg-neon-cyan hover:bg-neon-cyan/80 text-black font-bold">
                        {isLoading ? "INITIALIZING..." : "CONFIRM REGISTRATION & PRINT ID"}
                    </Button>
                </form>
            </div>
        </motion.div>
    );
}
