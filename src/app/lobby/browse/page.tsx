"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { motion } from "framer-motion";
import Link from "next/link";
import { Users, Lock, Unlock, Play, Plus, RefreshCw, LogOut, ArrowLeft } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import SafeImage from "@/components/ui/SafeImage";

export default function LobbyBrowser() {
    const router = useRouter();
    const { addToast } = useToast();
    const [lobbies, setLobbies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateWrapper, setShowCreateWrapper] = useState(false); // Using wrapper state if needed or just inline

    // Create Form State
    const [newItemName, setNewItemName] = useState("");
    const [isPrivate, setIsPrivate] = useState(false);
    const [difficulty, setDifficulty] = useState("NORMAL");

    // Code Join State
    const [joinCode, setJoinCode] = useState("");

    const fetchLobbies = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/lobby/list");
            const data = await res.json();
            if (Array.isArray(data)) setLobbies(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLobbies();
        const interval = setInterval(fetchLobbies, 5000); // Poll every 5s
        return () => clearInterval(interval);
    }, []);

    const handleCreate = async () => {
        // Empty name = Auto-generate
        try {
            const res = await fetch("/api/lobby/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newItemName,
                    isPublic: !isPrivate,
                    difficulty
                })
            });
            const data = await res.json();

            if (!res.ok) {
                addToast(data.error || "Failed to create lobby", "error");
                return;
            }

            if (data.id) {
                router.push(`/lobby/${data.id}`);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleJoin = async (lobbyId: string) => {
        try {
            const res = await fetch("/api/lobby/join", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lobbyId })
            });
            const data = await res.json();
            if (data.success) {
                router.push(`/lobby/${lobbyId}`);
            } else {
                addToast(data.error || "Failed to join", "error");
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleJoinCode = async () => {
        if (!joinCode) return;
        try {
            const res = await fetch("/api/lobby/join", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: joinCode })
            });
            const data = await res.json();
            if (data.success && data.lobbyId) { // Ensure API returns lobbyId
                router.push(`/lobby/${data.lobbyId}`);
            } else {
                addToast(data.error || "Failed to join", "error");
            }
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="min-h-full p-8 pt-24 space-y-8 bg-space-void relative">
            <div className="fixed top-6 left-8 z-50">
                <Link href="/menu" className="flex items-center text-neon-cyan hover:text-white transition-colors glass-panel px-4 py-2 rounded-full">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Bridge
                </Link>
            </div>

            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-4xl font-bold text-white neon-text mb-2 uppercase tracking-tighter">Mission Control</h1>
                    <p className="text-neon-cyan/80">Select a deployment or establish a new frequency.</p>
                </div>
                <div className="flex gap-4">
                    <Button variant="outline" onClick={fetchLobbies} disabled={loading} className="border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10">
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> REFRESH
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Lobby List */}
                <div className="lg:col-span-2 space-y-4">
                    {lobbies.length === 0 && !loading && (
                        <div className="glass-panel p-8 text-center text-gray-500">
                            No active communication signals detected. Start a new mission.
                        </div>
                    )}

                    {lobbies.map((lobby) => {
                        const currentPlayer = lobby.members.find((m: any) => m.isCurrentPlayer);
                        return (
                            <motion.div
                                key={lobby.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`glass-panel p-6 rounded-xl flex items-center justify-between group transition-all ${
                                    currentPlayer ? 'border-neon-cyan/70 shadow-[0_0_15px_rgba(0,255,255,0.15)]' : 'border-white/10 hover:border-neon-cyan/50'
                                }`}
                            >
                                <div className="flex-1 flex gap-4 items-center">
                                    {/* Host Portrait */}
                                    <div className={`hidden sm:flex w-16 h-16 rounded-full border overflow-hidden justify-center items-center transition-all ${
                                        currentPlayer ? 'border-neon-cyan/80 bg-neon-cyan/5 shadow-[0_0_12px_rgba(0,255,255,0.3)]' : 'border-white/20 bg-gray-900'
                                    }`}>
                                        <SafeImage
                                            src={lobby.members.find((m: any) => m.characterId === lobby.hostId)?.character.portrait}
                                            alt={lobby.members.find((m: any) => m.characterId === lobby.hostId)?.character.name}
                                            className="w-full h-full object-cover"
                                            fallback={
                                                <span className="text-xl font-bold text-gray-500">
                                                    {lobby.members.find((m: any) => m.characterId === lobby.hostId)?.character.class?.[0] || "?"}
                                                </span>
                                            }
                                        />
                                        {/* Turn Indicator Overlay */}
                                        {currentPlayer && (
                                            <div className="absolute inset-0 bg-neon-cyan/10 rounded-full animate-pulse" />
                                        )}
                                    </div>

                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <h3 className="text-xl font-bold text-white">{lobby.name}</h3>
                                            <span className={`text-[10px] px-2 py-0.5 rounded border ${lobby.difficulty === 'HARD' ? 'border-red-500 text-red-500' :
                                                lobby.difficulty === 'EASY' ? 'border-green-500 text-green-500' :
                                                    'border-neon-cyan text-neon-cyan'
                                                }`}>
                                                {lobby.difficulty}
                                            </span>
                                            {currentPlayer && (
                                                <span className="text-[9px] px-2 py-0.5 rounded bg-neon-cyan text-black font-bold tracking-wider uppercase">
                                                    Current Turn
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-sm text-gray-400 flex items-center gap-4">
                                            <span>HOST: {lobby.members.find((m: any) => m.characterId === lobby.hostId)?.character.name || "Unknown"}</span>
                                            <span>MEMBERS: {lobby.members.length}/4</span>
                                            <span className="text-xs font-mono ml-2 text-gray-600">ID: {lobby.code}</span>
                                        </div>
                                    </div>
                                </div>
                                <Button onClick={() => handleJoin(lobby.id)}>
                                    JOIN SQUAD <Play className="w-4 h-4 ml-2" />
                                </Button>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Sidebar: Create & Join Code */}
                <div className="space-y-6">
                    {/* Create Lobby */}
                    <div className="glass-panel p-6 rounded-xl">
                        <h2 className="text-lg font-bold text-white mb-4 flex items-center">
                            <Plus className="w-5 h-5 mr-2 text-neon-magenta" /> NEW MISSION
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">LOBBY NAME</label>
                                <Input
                                    value={newItemName}
                                    onChange={(e) => setNewItemName(e.target.value)}
                                    placeholder="Auto-Generated Name..."
                                    className="bg-black/40 border-white/10"
                                />
                            </div>

                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">DIFFICULTY</label>
                                <select
                                    value={difficulty}
                                    onChange={(e) => setDifficulty(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-md p-2 text-white text-sm focus:border-neon-cyan outline-none"
                                >
                                    <option value="EASY">TRAINING (Easy)</option>
                                    <option value="NORMAL">STANDARD (Normal)</option>
                                    <option value="HARD">VETERAN (Hard)</option>
                                </select>
                            </div>

                            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsPrivate(!isPrivate)}>
                                <div className={`w-4 h-4 border rounded ${isPrivate ? 'bg-neon-magenta border-neon-magenta' : 'border-gray-500'}`} />
                                <span className="text-sm text-gray-300">Private Lobby</span>
                            </div>

                            <Button onClick={handleCreate} className="w-full">
                                INITIALIZE LOBBY
                            </Button>
                        </div>
                    </div>

                    {/* Join by Code */}
                    <div className="glass-panel p-6 rounded-xl">
                        <h2 className="text-lg font-bold text-white mb-4 flex items-center">
                            <Lock className="w-5 h-5 mr-2 text-neon-cyan" /> ENCRYPTED CHANNEL
                        </h2>
                        <div className="flex gap-2">
                            <Input
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                placeholder="ENTER CODE"
                                maxLength={4}
                                className="bg-black/40 border-white/10 text-center font-mono tracking-widest uppercase"
                            />
                            <Button onClick={handleJoinCode} disabled={joinCode.length < 4} variant="secondary">
                                JOIN
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
