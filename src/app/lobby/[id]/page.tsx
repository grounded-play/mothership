"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Shield, Copy, Play, LogOut, Swords } from "lucide-react";

export default function LobbyRoom() {
    const { id } = useParams();
    const router = useRouter();
    const [lobby, setLobby] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [currentUser, setCurrentUser] = useState<any>(null);

    const fetchLobby = async () => {
        try {
            const res = await fetch(`/api/lobby/details?id=${id}`);
            if (!res.ok) {
                if (res.status === 404) {
                    setError("Lobby disbanded or not found.");
                    setTimeout(() => router.push("/lobby/browse"), 3000);
                }
                return;
            }
            const data = await res.json();
            setLobby(data.lobby);
            setCurrentUser(data.currentUser);

            if (data.lobby.status === "IN_PROGRESS") {
                router.push(`/game/${data.lobby.id}`);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLobby();
        const interval = setInterval(fetchLobby, 2000); // Fast poll for updates
        return () => clearInterval(interval);
    }, [id]);

    const handleReady = async () => {
        await fetch("/api/lobby/ready", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lobbyId: id })
        });
        fetchLobby();
    };

    const handleStart = async () => {
        await fetch("/api/lobby/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lobbyId: id })
        });
        // The poll will redirect us
    };

    const handleLeave = async () => {
        await fetch("/api/lobby/leave", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lobbyId: id })
        });
        router.push("/lobby/browse");
    };

    if (loading) return <div className="text-center pt-20 text-neon-cyan">ESTABLISHING UPLINK...</div>;
    if (error) return <div className="text-center pt-20 text-red-500 font-bold">{error}</div>;
    if (!lobby) return null;

    const isHost = lobby.hostId === currentUser?.id;
    const allReady = lobby.members.every((m: any) => m.isReady);

    return (
        <div className="min-h-screen p-8 pt-24 max-w-4xl mx-auto space-y-8">
            {/* Header */}
            <div className="glass-panel p-8 rounded-xl flex justify-between items-center border-neon-cyan/30">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">{lobby.name}</h1>
                    <div className="flex items-center gap-4 text-sm font-mono text-neon-cyan">
                        <span className="flex items-center"><Shield className="w-4 h-4 mr-2" /> CODE: <span className="text-white font-bold ml-2 select-all">{lobby.code}</span></span>
                        <span className={`px-2 py-0.5 rounded border ${lobby.difficulty === 'HARD' ? 'border-red-500 text-red-500' :
                            lobby.difficulty === 'EASY' ? 'border-green-500 text-green-500' :
                                'border-neon-cyan text-neon-cyan'
                            }`}>{lobby.difficulty}</span>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-xs text-gray-400 mb-1">STATUS</div>
                    <div className="text-xl font-bold text-white tracking-widest animate-pulse">WAITING FOR SQUAD</div>
                </div>
            </div>

            {/* Roster */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {lobby.members.map((member: any) => (
                    <motion.div
                        key={member.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`glass-panel p-4 rounded-xl flex items-center justify-between ${member.isReady ? 'border-green-500/50 bg-green-950/20' : 'border-white/10'}`}
                    >
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center border overflow-hidden ${member.isReady ? 'border-green-500 bg-green-900/40 text-green-400' : 'border-gray-600 bg-gray-800 text-gray-400'}`}>
                                {member.character.portrait ? (
                                    <img src={member.character.portrait} className="w-full h-full object-cover" alt={member.character.name} />
                                ) : (
                                    member.character.class[0]
                                )}
                            </div>
                            <div>
                                <div className="font-bold text-white">{member.character.name}</div>
                                <div className="text-xs text-gray-400 mb-0.5">{member.character.class} | Lvl {member.character.level}</div>
                                <div className="flex gap-3 text-[10px] font-mono">
                                    <span className="text-yellow-500 font-bold">CR: {member.character.credits}</span>
                                    <span className="text-purple-400 font-bold">VOID: {member.character.voidTokens}</span>
                                </div>
                            </div>
                        </div>
                        {member.isReady ? (
                            <span className="text-green-500 font-bold text-sm tracking-wide">READY</span>
                        ) : (
                            <span className="text-gray-600 text-sm font-mono tracking-wide">PREPARING...</span>
                        )}
                    </motion.div>
                ))}
                {Array.from({ length: 4 - lobby.members.length }).map((_, i) => (
                    <div key={i} className="glass-panel p-4 rounded-xl flex items-center justify-center text-gray-700 border-dashed border-gray-800">
                        <Users className="w-6 h-6 mr-2 opacity-50" /> EMPTY SLOT
                    </div>
                ))}
            </div>

            {/* Actions */}
            <div className="fixed bottom-0 left-0 w-full glass-panel border-t border-white/10 p-4 flex justify-between items-center backdrop-blur-md z-50">
                <div className="max-w-4xl mx-auto w-full flex justify-between">
                    <Button variant="ghost" className="text-red-400 hover:bg-red-950/30" onClick={handleLeave}>
                        <LogOut className="w-4 h-4 mr-2" /> ABORT MISSION
                    </Button>

                    <div className="flex gap-4">
                        {!isHost ? (
                            <Button
                                onClick={handleReady}
                                className={`w-48 ${currentUser?.isReady ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-green-600 hover:bg-green-500'}`}
                            >
                                {currentUser?.isReady ? "CANCEL READY" : "READY UP"}
                            </Button>
                        ) : (
                            <Button
                                onClick={handleStart}
                                disabled={!allReady}
                                className={`w-48 ${allReady ? 'bg-neon-cyan text-black hover:bg-cyan-400' : 'opacity-50 cursor-not-allowed'}`}
                            >
                                <Play className="w-4 h-4 mr-2" /> LAUNCH MISSION
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
