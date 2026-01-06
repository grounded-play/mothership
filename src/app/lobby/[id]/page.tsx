"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { motion, AnimatePresence } from "framer-motion";
import SafeImage from "@/components/ui/SafeImage";
import { Users, Shield, Play, LogOut } from "lucide-react";
import { getBackpackCapacity } from "@/lib/game/backpack";
import { normalizePublicPath } from "@/lib/imagePath";


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
                if (res.status === 404 || res.status === 410) {
                    setError(res.status === 410 ? "Lobby expired." : "Lobby disbanded or not found.");
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
    const inventory = currentUser?.inventory || [];
    const backpackLevel = currentUser?.backpackLevel ?? 1;
    const backpackCapacity = getBackpackCapacity(backpackLevel);
    const getItemSlot = (item: any) => {
        if (item?.equipSlot) return item.equipSlot.toUpperCase();
        const type = (item?.type || "").toLowerCase();
        if (type === "weapon") return "WEAPON";
        if (type === "armor" || type.includes("suit")) return "ARMOR";
        return null;
    };
    const weaponItems = inventory.filter((inv: any) => getItemSlot(inv.item) === "WEAPON");
    const armorItems = inventory.filter((inv: any) => getItemSlot(inv.item) === "ARMOR");
    const equippedWeapon = weaponItems.find((inv: any) => inv.isEquipped);
    const equippedArmor = armorItems.find((inv: any) => inv.isEquipped);
    const formatUses = (inv: any) => {
        const max = inv.usesMax ?? inv.item?.maxUses ?? null;
        const remaining = inv.usesRemaining ?? max;
        if (!max) return null;
        return `${remaining ?? 0}/${max}`;
    };

    const handleEquip = async (slot: "WEAPON" | "ARMOR", inventoryItemId?: string | null) => {
        await fetch("/api/lobby/loadout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lobbyId: id, slot, inventoryItemId: inventoryItemId || null })
        });
        fetchLobby();
    };

    const getSuitForClass = (cls: string) => {
        const c = cls.toLowerCase();
        if (c === "marine") return { name: "COMMAND", color: "text-green-500", border: "border-green-500/50", bg: "bg-green-500/10" };
        if (c === "engineer") return { name: "PLASMA", color: "text-orange-500", border: "border-orange-500/50", bg: "bg-orange-500/10" };
        if (c === "scientist") return { name: "BIOTECH", color: "text-red-500", border: "border-red-500/50", bg: "bg-red-500/10" };
        if (c === "scout") return { name: "VOID", color: "text-purple-500", border: "border-purple-500/50", bg: "bg-purple-500/10" };
        return { name: "UNKNOWN", color: "text-gray-500", border: "border-gray-500", bg: "bg-gray-500/10" };
    };

    const getSuitForItem = (item: any) => {
        const s = (item?.suit || "").toUpperCase();
        if (s === "COMMAND") return { name: "CMD", color: "text-green-400", border: "border-green-500/30", bg: "bg-green-900/20" };
        if (s === "PLASMA") return { name: "PLSM", color: "text-orange-400", border: "border-orange-500/30", bg: "bg-orange-900/20" };
        if (s === "BIOTECH") return { name: "BIO", color: "text-red-400", border: "border-red-500/30", bg: "bg-red-900/20" };
        if (s === "VOID") return { name: "VOID", color: "text-purple-400", border: "border-purple-500/30", bg: "bg-purple-900/20" };
        return null;
    };

    return (
        <div className="min-h-full p-8 pt-24 max-w-4xl mx-auto space-y-8">
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
                {lobby.members.map((member: any) => {
                    const suit = getSuitForClass(member.character.class);
                    return (
                        <motion.div
                            key={member.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={`glass-panel p-4 rounded-xl flex items-center justify-between ${member.isReady ? 'border-green-500/50 bg-green-950/20' : 'border-white/10'}`}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center border overflow-hidden ${member.isReady ? 'border-green-500 bg-green-900/40 text-green-400' : 'border-gray-600 bg-gray-800 text-gray-400'}`}>
                                    {member.character.portrait ? (
                                        <SafeImage
                                            src={member.character.portrait}
                                            alt={member.character.name}
                                            className="w-full h-full object-cover"
                                            fallback={<span>{member.character.class[0]}</span>}
                                        />
                                    ) : (
                                        member.character.class[0]
                                    )}
                                </div>
                                <div>
                                    <div className="font-bold text-white">{member.character.name}</div>
                                    <div className="text-xs text-gray-400 mb-0.5 flex items-center gap-2">
                                        <span>{member.character.class} | Lvl {member.character.level}</span>
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${suit.border} ${suit.color} ${suit.bg} font-mono`}>
                                            {suit.name}
                                        </span>
                                    </div>
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
                    );
                })}
                {Array.from({ length: 4 - lobby.members.length }).map((_, i) => (
                    <div key={i} className="glass-panel p-4 rounded-xl flex items-center justify-center text-gray-700 border-dashed border-gray-800">
                        <Users className="w-6 h-6 mr-2 opacity-50" /> EMPTY SLOT
                    </div>
                ))}
            </div>

            {/* Loadout */}
            {currentUser && (
                <div className="glass-panel p-6 rounded-xl border border-white/10">
                    <div className="text-xs text-gray-400 uppercase tracking-widest mb-4">Loadout</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-3">
                            <div className="text-[10px] text-gray-500 uppercase tracking-widest flex justify-between items-center">
                                <span>Weapon</span>
                                {equippedWeapon && (
                                    <button
                                        type="button"
                                        onClick={() => handleEquip("WEAPON", null)}
                                        className="text-[9px] text-red-400 hover:text-red-300 border border-red-900/50 rounded px-2 py-0.5 bg-red-950/20"
                                    >
                                        UNEQUIP
                                    </button>
                                )}
                            </div>
                            <div className="bg-black/40 border border-white/10 rounded p-3 text-sm flex gap-3 items-center">
                                <div className="w-10 h-10 bg-black/60 rounded border border-white/10 shrink-0 overflow-hidden flex items-center justify-center">
                                    {equippedWeapon && normalizePublicPath(equippedWeapon.customImage || equippedWeapon.item.icon) ? (
                                        <SafeImage
                                            src={equippedWeapon.customImage || equippedWeapon.item.icon}
                                            alt={equippedWeapon.item.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="text-xs text-gray-600 font-bold">{equippedWeapon?.item?.name?.[0] || "-"}</div>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <div className="text-white font-bold truncate">{equippedWeapon?.item?.name || "None Equipped"}</div>
                                        {(() => {
                                            const s = equippedWeapon ? getSuitForItem(equippedWeapon.item) : null;
                                            return s ? (
                                                <span className={`text-[8px] px-1 rounded border leading-none pt-0.5 pb-0.5 ${s.border} ${s.color} ${s.bg}`}>
                                                    {s.name}
                                                </span>
                                            ) : null;
                                        })()}
                                    </div>
                                    {equippedWeapon && (
                                        <div className="text-[10px] text-gray-500 mt-1">
                                            Uses: {formatUses(equippedWeapon) || "∞"}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                                {weaponItems.filter((inv: any) => {
                                    const uses = formatUses(inv);
                                    return !(uses && uses.startsWith("0/"));
                                }).map((inv: any) => {
                                    const uses = formatUses(inv);
                                    const s = getSuitForItem(inv.item);
                                    return (
                                        <button
                                            key={inv.id}
                                            type="button"
                                            onClick={() => handleEquip("WEAPON", inv.id)}
                                            className={`w-full text-left text-xs px-3 py-2 rounded border transition flex items-center gap-2 ${inv.isEquipped ? "border-neon-cyan text-neon-cyan bg-neon-cyan/5" : "border-white/10 text-gray-300 hover:border-white/30"}`}
                                        >
                                            <span className="truncate flex-1 flex items-center gap-2">
                                                {inv.item.name}
                                                {s && <span className={`text-[8px] px-1 rounded border leading-none pt-0.5 pb-0.5 opacity-80 ${s.border} ${s.color} ${s.bg}`}>{s.name}</span>}
                                            </span>
                                            {uses ? <span className="ml-2 text-[10px] text-gray-500 shrink-0">({uses})</span> : null}
                                        </button>
                                    );
                                })}
                                {weaponItems.length === 0 && <div className="text-[10px] text-gray-600">No weapons in inventory.</div>}
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div className="text-[10px] text-gray-500 uppercase tracking-widest flex justify-between items-center">
                                <span>Armor</span>
                                {equippedArmor && (
                                    <button
                                        type="button"
                                        onClick={() => handleEquip("ARMOR", null)}
                                        className="text-[9px] text-red-400 hover:text-red-300 border border-red-900/50 rounded px-2 py-0.5 bg-red-950/20"
                                    >
                                        UNEQUIP
                                    </button>
                                )}
                            </div>
                            <div className="bg-black/40 border border-white/10 rounded p-3 text-sm flex gap-3 items-center">
                                <div className="w-10 h-10 bg-black/60 rounded border border-white/10 shrink-0 overflow-hidden flex items-center justify-center">
                                    {equippedArmor && normalizePublicPath(equippedArmor.customImage || equippedArmor.item.icon) ? (
                                        <SafeImage
                                            src={equippedArmor.customImage || equippedArmor.item.icon}
                                            alt={equippedArmor.item.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="text-xs text-gray-600 font-bold">{equippedArmor?.item?.name?.[0] || "-"}</div>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <div className="text-white font-bold truncate">{equippedArmor?.item?.name || "None Equipped"}</div>
                                        {(() => {
                                            const s = equippedArmor ? getSuitForItem(equippedArmor.item) : null;
                                            return s ? (
                                                <span className={`text-[8px] px-1 rounded border leading-none pt-0.5 pb-0.5 ${s.border} ${s.color} ${s.bg}`}>
                                                    {s.name}
                                                </span>
                                            ) : null;
                                        })()}
                                    </div>
                                    {equippedArmor && (
                                        <div className="text-[10px] text-gray-500 mt-1">
                                            Uses: {formatUses(equippedArmor) || "∞"}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                                {armorItems.filter((inv: any) => {
                                    const uses = formatUses(inv);
                                    return !(uses && uses.startsWith("0/"));
                                }).map((inv: any) => {
                                    const uses = formatUses(inv);
                                    const s = getSuitForItem(inv.item);
                                    return (
                                        <button
                                            key={inv.id}
                                            type="button"
                                            onClick={() => handleEquip("ARMOR", inv.id)}
                                            className={`w-full text-left text-xs px-3 py-2 rounded border transition flex items-center gap-2 ${inv.isEquipped ? "border-neon-cyan text-neon-cyan bg-neon-cyan/5" : "border-white/10 text-gray-300 hover:border-white/30"}`}
                                        >
                                            <span className="truncate flex-1 flex items-center gap-2">
                                                {inv.item.name}
                                                {s && <span className={`text-[8px] px-1 rounded border leading-none pt-0.5 pb-0.5 opacity-80 ${s.border} ${s.color} ${s.bg}`}>{s.name}</span>}
                                            </span>
                                            {uses ? <span className="ml-2 text-[10px] text-gray-500 shrink-0">({uses})</span> : null}
                                        </button>
                                    );
                                })}
                                {armorItems.length === 0 && <div className="text-[10px] text-gray-600">No armor in inventory.</div>}
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div className="text-[10px] text-gray-500 uppercase tracking-widest">Backpack</div>
                            <div className="bg-black/40 border border-white/10 rounded p-3 text-sm">
                                <div className="text-white font-bold">Level {backpackLevel}</div>
                                <div className="text-[10px] text-gray-500 mt-1">Capacity: {backpackCapacity} slots</div>
                                <div className="text-[10px] text-gray-600 mt-2">Upgrade at the printer station.</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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

