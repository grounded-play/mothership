"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import SafeImage from "@/components/ui/SafeImage";
import { User, Zap, RefreshCw, Shield, Crosshair, FileText } from "lucide-react";
import { motion } from "framer-motion";


interface CharacterProfileProps {
    character: any; // Type accurately if possible
    isTutorialGuide?: boolean;
}

export default function CharacterProfile({ character, isTutorialGuide = false }: CharacterProfileProps) {
    const router = useRouter();
    const [generating, setGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [stats, setStats] = useState({
        hair: "",
        eyes: "",
        distinctions: ""
    });
    const [selectedClass, setSelectedClass] = useState(character.class.toLowerCase());
    const [isEditing, setIsEditing] = useState(false);
    const [confirmMintOpen, setConfirmMintOpen] = useState(false);
    const { addToast } = useToast();

    const classes = [
        { id: "marine", icon: Crosshair, desc: "Combat Specialist" },
        { id: "android", icon: User, desc: "Synthetic Intelligence" },
        { id: "scientist", icon: Zap, desc: "Xeno-Biologist" },
        { id: "teamster", icon: Shield, desc: "Heavy Laborer" }
    ];

    const handleReroll = () => {
        if (character.credits < 100) {
            addToast("Insufficient Credits (100 Needed)", "error");
            return;
        }
        setConfirmMintOpen(true);
    };

    const executeReroll = async () => {
        setConfirmMintOpen(false);
        setGenerating(true);
        // setProgress(0); // No realtime progress on client side for background job

        try {
            const res = await fetch("/api/character/generate-art", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    characterId: character.id,
                    class: selectedClass,
                    features: stats.distinctions || "High detail, sci-fi portrait",
                    hair: stats.hair || "Styled",
                    eyes: stats.eyes || "Glowing"
                }),
            });

            const data = await res.json().catch(() => ({}));

            if (res.status === 402) {
                addToast("Insufficient Credits", "error");
                setGenerating(false);
                return;
            }

            if (res.ok && data.status === "QUEUED") {
                addToast("Portrait Request Queued at 3D Printer", "success");
                // Navigate to Printer to see queue
                router.push("/printer");
            } else {
                addToast(data.error || "Request failed", "error");
            }
        } catch (e) {
            console.error(e);
            addToast("Connection lost", "error");
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="relative glass-panel p-1 rounded-2xl border border-white/10 w-full max-w-sm mx-auto shadow-2xl overflow-visible">
            {/* Holographic Border Effect */}
            <div className="absolute inset-0 rounded-2xl border border-neon-cyan/30 opacity-50 pointer-events-none" />

            <div className="relative h-[400px] w-full rounded-xl overflow-hidden bg-black group">
                {isEditing ? (
                    <div className="absolute inset-0 bg-black/90 z-20 p-6 overflow-y-auto custom-scrollbar">
                        <div className="space-y-4">
                            <h3 className="text-neon-cyan font-bold uppercase tracking-wider text-sm mb-4 border-b border-neon-cyan/30 pb-2">Identity Rewrite</h3>

                            {/* Class Selection */}
                            <div className="space-y-2">
                                <label className="text-[10px] uppercase text-gray-500">Specialization</label>

                                {/* Service Record Display */}
                                <div className="bg-black/30 rounded-lg p-3 border border-white/10">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Service Record</div>
                                    <div className="space-y-2 text-xs">
                                        {(typeof character.serviceRecord === 'string' ? JSON.parse(character.serviceRecord) : character.serviceRecord || []).map((record: any, idx: number) => (
                                            <div key={idx} className="flex justify-between border-b border-white/5 pb-1">
                                                <span className="text-gray-400">{record.event}</span>
                                                <span className="text-gray-500 font-mono">{record.date}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {classes.map((c) => (
                                        <div
                                            key={c.id}
                                            onClick={() => setSelectedClass(c.id)}
                                            className={`p-2 border rounded cursor-pointer transition-all ${selectedClass === c.id
                                                ? "bg-neon-cyan/20 border-neon-cyan text-white"
                                                : "border-white/10 hover:border-white/30 text-gray-400"
                                                }`}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <c.icon className="w-3 h-3" />
                                                <span className="text-[10px] font-bold uppercase">{c.id}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Visual Inputs */}
                            <div className="space-y-2">
                                <label className="text-[10px] uppercase text-gray-500">Visual Parameters</label>
                                <input
                                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-neon-cyan"
                                    placeholder="Hair Style (e.g. Mohawk)"
                                    value={stats.hair}
                                    onChange={(e) => setStats({ ...stats, hair: e.target.value })}
                                />
                                <input
                                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-neon-cyan"
                                    placeholder="Eye Color (e.g. Cybernetic Red)"
                                    value={stats.eyes}
                                    onChange={(e) => setStats({ ...stats, eyes: e.target.value })}
                                />
                                <textarea
                                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-neon-cyan resize-none"
                                    placeholder="Distinguishing Features..."
                                    rows={2}
                                    value={stats.distinctions}
                                    onChange={(e) => setStats({ ...stats, distinctions: e.target.value })}
                                />
                            </div>

                        </div>
                    </div>
                ) : (
                    <>
                        {character.portrait ? (
                            <SafeImage
                                src={character.portrait}
                                alt={character.name}
                                className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                                fallback={
                                    <div className="flex flex-col items-center justify-center h-full text-gray-600">
                                        <User className="h-20 w-20 mb-4 opacity-50" />
                                        <p className="text-xs uppercase tracking-widest">No Visual Record</p>
                                    </div>
                                }
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-600">
                                <User className="h-20 w-20 mb-4 opacity-50" />
                                <p className="text-xs uppercase tracking-widest">No Visual Record</p>
                            </div>
                        )}
                    </>
                )}

                {/* Overlay Text (Hidden when editing) */}
                {!isEditing && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/60 to-transparent p-6 pt-12 pointer-events-none">
                        <div className="flex items-center gap-2 mb-1">
                            <h2 className="text-3xl font-bold text-white uppercase tracking-tighter leading-none">{character.name}</h2>
                            {isTutorialGuide && (
                                <span className="px-2 py-0.5 bg-neon-cyan/30 border border-neon-cyan/50 text-neon-cyan text-[9px] font-bold uppercase tracking-widest rounded">
                                    Tutorial Guide
                                </span>
                            )}
                        </div>
                        <p className="text-neon-cyan text-sm uppercase tracking-[0.2em] mt-1">{character.class} | Lvl {character.level}</p>
                        <p className="text-gray-300 text-xs mt-1 font-mono">{character.loreNotes?.split('.')[0] || ''}</p>
                    </div>
                )}

                {/* Status Indicator */}
                <div className="absolute top-4 right-4 flex items-center gap-2">
                    <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_#0f0]" />
                    <span className="text-[10px] text-green-500 uppercase tracking-widest">Active</span>
                </div>
            </div>

            {/* Controls */}
            <div className="p-4 grid grid-cols-2 gap-2">
                <Button
                    variant="ghost"
                    className={`border border-white/10 text-white hover:bg-white/10 text-[10px] uppercase tracking-wider h-10 ${isEditing ? "bg-white/10" : ""}`}
                    onClick={() => setIsEditing(!isEditing)}
                    disabled={generating}
                >
                    {isEditing ? "Cancel" : "Edit Specs"}
                </Button>

                <Button
                    variant="outline"
                    className="border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 text-[10px] uppercase tracking-wider h-10 group"
                    onClick={handleReroll}
                    disabled={generating}
                >
                    {generating ? (
                        <span className="animate-pulse">{progress}%</span>
                    ) : (
                        <span className="flex items-center justify-center gap-2">
                            <RefreshCw className="w-3 h-3 group-hover:rotate-180 transition-transform duration-500" />
                            Update (100 C)
                        </span>
                    )}
                </Button>
            </div>

            {/* Progress Bar Overlay */}
            {generating && (
                <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: progress / 100 }}
                    className="absolute bottom-0 left-0 h-1 bg-neon-cyan origin-left z-50 w-full"
                />
            )}

            <ConfirmDialog
                open={confirmMintOpen}
                title="Mint New Portrait"
                message={`Mint new ID portrait for 100 credits? Class updates to ${selectedClass.toUpperCase()}.`}
                confirmLabel="MINT"
                onConfirm={executeReroll}
                onCancel={() => setConfirmMintOpen(false)}
                busy={generating}
            />
        </div>
    );
}
