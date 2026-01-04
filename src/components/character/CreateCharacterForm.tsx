"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { User, Shield, Zap, Crosshair } from "lucide-react";
import { motion } from "framer-motion";
import SafeImage from "@/components/ui/SafeImage";

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
    const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
    const [generating, setGenerating] = useState(false);
    const [progress, setProgress] = useState(0);

    const [features, setFeatures] = useState({
        hair: "",
        eyes: "",
        distinctions: ""
    });

    async function generatePortrait(e: React.MouseEvent) {
        e.preventDefault();
        if (!features.hair && !features.eyes && !features.distinctions) return;

        setGenerating(true);
        setProgress(0);

        try {
            // Use temporary ID for generation (will be linked on save)
            // Ideally we'd create the char first, but for UX let's generate first? 
            // Actually, we need an ID for the filename. Let's create a temp ID or pass one.
            // Simplified: Generate with a temporary 'new_character' ID prefix.
            const tempId = "new_char_" + Math.random().toString(36).substring(7);

            const res = await fetch("/api/character/generate-art", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    characterId: tempId, // API might check ownership... wait. 
                    // The API as written checks ownership of an existing character. 
                    // We need to update the API or this logic to allow 'new' characters.
                    // For now, let's just bypass the ID check in API (I will fix API next step).
                    features: features.distinctions,
                    hair: features.hair,
                    eyes: features.eyes,
                    class: selectedClass
                }),
            });

            if (!res.body) throw new Error("No stream");

            const reader = res.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = decoder.decode(value);
                const lines = text.split('\n\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.progress) setProgress(data.progress);
                            if (data.image) setPortraitUrl(data.image);
                            if (data.error) console.error(data.error);
                        } catch (e) { console.error("Parse error", e); }
                    }
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setGenerating(false);
        }
    }

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData(e.currentTarget);
        const name = formData.get("name") as string;

        try {
            const res = await fetch("/api/character", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    class: selectedClass,
                    portrait: portraitUrl,
                }),
            });

            if (res.ok) {
                router.push("/menu");
                router.refresh();
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
            className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 glass-panel p-8 rounded-2xl"
        >
            <div className="space-y-6">
                <div className="text-left mb-4">
                    <h1 className="text-3xl font-bold text-white mb-2">IDENTITY REGISTRATION</h1>
                    <p className="text-neon-cyan/70 uppercase text-xs tracking-[0.2em]">{selectedClass} CLASS INTAKE</p>
                </div>

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
                        <div className="grid grid-cols-3 gap-2">
                            {classes.map((c) => (
                                <div
                                    key={c.id}
                                    onClick={() => setSelectedClass(c.id)}
                                    className={`cursor-pointer border rounded-md p-3 flex flex-col items-center gap-1 transition-all duration-300 ${selectedClass === c.id
                                        ? "bg-neon-cyan/20 border-neon-cyan"
                                        : "bg-black/40 border-white/10 hover:border-white/30"
                                        }`}
                                >
                                    <c.icon className={`h-6 w-6 ${selectedClass === c.id ? "text-neon-cyan" : "text-gray-500"}`} />
                                    <span className={`text-[10px] uppercase font-bold ${selectedClass === c.id ? "text-white" : "text-gray-400"}`}>{c.id}</span>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500 h-4">
                            {classes.find(c => c.id === selectedClass)?.desc}
                        </p>
                    </div>

                    <div className="pt-4 border-t border-white/10 space-y-4">
                        <label className="text-xs text-neon-cyan/80 uppercase tracking-wide flex items-center gap-2">
                            <Zap className="w-3 h-3" /> Visual Parameters
                        </label>
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
                        <Button
                            onClick={generatePortrait}
                            disabled={generating}
                            variant="secondary"
                            className="w-full h-10 text-xs tracking-wider"
                        >
                            {generating ? "UPLINKING TO COZY..." : "GENERATE ID PORTRAIT"}
                        </Button>
                    </div>

                    <Button type="submit" disabled={isLoading} className="w-full h-12 text-lg mt-4 bg-neon-cyan hover:bg-neon-cyan/80 text-black font-bold">
                        {isLoading ? "INITIALIZING..." : "CONFIRM REGISTRATION"}
                    </Button>
                </form>
            </div>

            {/* Portrait Preview Panel */}
            <div className="relative flex items-center justify-center bg-black/40 rounded-xl border border-white/10 overflow-hidden min-h-[400px]">
                {portraitUrl ? (
                    <div className="relative w-full h-full">
                        <SafeImage
                            src={portraitUrl}
                            alt="Generated Portrait"
                            className="w-full h-full object-cover"
                            fallback={
                                <div className="text-center space-y-4 px-8">
                                    <div className="w-24 h-24 mx-auto border-2 border-dashed border-gray-600 rounded-full flex items-center justify-center">
                                        <User className="w-10 h-10 text-gray-600" />
                                    </div>
                                    <p className="text-gray-500 text-sm">Awaiting Visual Data...</p>
                                </div>
                            }
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
                        <div className="absolute bottom-4 left-4">
                            <p className="text-white text-lg font-bold">{selectedClass.toUpperCase()}</p>
                            <p className="text-neon-cyan text-xs">ID VERIFIED</p>
                        </div>
                    </div>
                ) : (
                    <div className="text-center space-y-4 px-8">
                        <div className="w-24 h-24 mx-auto border-2 border-dashed border-gray-600 rounded-full flex items-center justify-center">
                            <User className="w-10 h-10 text-gray-600" />
                        </div>
                        <p className="text-gray-500 text-sm">Awaiting Visual Data...</p>
                    </div>
                )}

                {/* Progress Overlay */}
                {generating && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20">
                        <div className="w-64 space-y-2">
                            <div className="flex justify-between text-xs text-neon-cyan uppercase">
                                <span>Neural Link</span>
                                <span>{progress}%</span>
                            </div>
                            <div className="h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-neon-cyan"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                />
                            </div>
                            <p className="text-[10px] text-gray-500 text-center animate-pulse">
                                Negotiating with ComfyUI...
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
