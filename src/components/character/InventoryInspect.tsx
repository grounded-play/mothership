"use client";

import { useMemo, useState } from "react";
import { Box, X } from "lucide-react";
import SafeImage from "@/components/ui/SafeImage";

const parseJSON = (raw: any, fallback: any) => {
    try { return JSON.parse(raw); } catch { return fallback; }
};

const getRarityClass = (rarity?: string) => {
    if (rarity === "Legendary") return "text-neon-magenta";
    if (rarity === "Epic") return "text-purple-400";
    if (rarity === "Rare") return "text-neon-blue";
    return "text-white";
};

export default function InventoryInspect({ inventory }: { inventory: any[] }) {
    const [selected, setSelected] = useState<any | null>(null);
    const selectedStats = useMemo(() => parseJSON(selected?.instanceStats || "{}", {}), [selected?.instanceStats]);
    const selectedTraits = useMemo(() => {
        const parsed = parseJSON(selected?.visualTraits || "{}", null);
        if (parsed && typeof parsed === "object") return parsed;
        return selected?.visualTraits || "";
    }, [selected?.visualTraits]);

    return (
        <>
            {inventory.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {inventory.map((entry) => (
                        <button
                            key={entry.id}
                            type="button"
                            onClick={() => setSelected(entry)}
                            className="flex items-center gap-3 p-3 bg-black/40 border border-white/5 rounded-lg hover:bg-white/5 transition-colors group text-left"
                        >
                            <div className="w-12 h-12 bg-black/60 rounded flex items-center justify-center shrink-0 border border-white/10 overflow-hidden relative">
                                {(entry.customImage || entry.item.icon) ? (
                                    <SafeImage
                                        src={entry.customImage || entry.item.icon}
                                        fallbackSrc={entry.item.icon}
                                        alt={entry.item.name}
                                        className="w-full h-full object-cover"
                                        fallback={<span className="text-xl font-bold text-gray-600">{entry.item.name[0]}</span>}
                                    />
                                ) : (
                                    <span className="text-xl font-bold text-gray-600">{entry.item.name[0]}</span>
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className={`font-medium truncate ${getRarityClass(entry.item.rarity)}`}>
                                    {entry.item.name}
                                </div>
                                <div className="text-[10px] text-gray-400 truncate uppercase mt-0.5">
                                    {entry.visualTraits || entry.item.type}
                                </div>
                                <div className="text-[10px] text-neon-cyan/70 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    Inspect
                                </div>
                            </div>
                            <div className="text-sm font-mono text-gray-500 bg-black/80 px-2 py-1 rounded border border-white/5">
                                x{entry.quantity}
                            </div>
                        </button>
                    ))}
                </div>
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 opacity-50">
                    <Box className="h-16 w-16 mb-2" />
                    <p>Cargo Hold Empty</p>
                </div>
            )}

            {selected && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg glass-panel p-6 rounded-xl border border-white/10 shadow-2xl">
                        <div className="flex items-start justify-between gap-4 mb-4">
                            <div>
                                <div className={`text-lg font-bold ${getRarityClass(selected.item?.rarity)}`}>
                                    {selected.item?.name}
                                </div>
                                <div className="text-xs text-gray-400 uppercase tracking-widest">
                                    {selected.item?.type} {selected.item?.rarity ? `| ${selected.item?.rarity}` : ""}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelected(null)}
                                className="text-gray-500 hover:text-white"
                                aria-label="Close item inspection"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex gap-4 items-start">
                            <div className="w-24 h-24 bg-black/60 rounded border border-white/10 overflow-hidden flex items-center justify-center">
                                {(selected.customImage || selected.item?.icon) ? (
                                    <SafeImage
                                        src={selected.customImage || selected.item?.icon}
                                        fallbackSrc={selected.item?.icon}
                                        alt={selected.item?.name}
                                        className="w-full h-full object-cover"
                                        fallback={<span className="text-2xl font-bold text-gray-600">{selected.item?.name?.[0]}</span>}
                                    />
                                ) : (
                                    <span className="text-2xl font-bold text-gray-600">{selected.item?.name?.[0]}</span>
                                )}
                            </div>
                            <div className="flex-1 space-y-2 text-xs text-gray-300">
                                <div><span className="text-gray-500">Quantity:</span> x{selected.quantity}</div>
                                <div><span className="text-gray-500">Min Level:</span> {selected.item?.minLevel ?? 1}</div>
                                <div><span className="text-gray-500">Equipped:</span> {selected.isEquipped ? "Yes" : "No"}</div>
                                <div><span className="text-gray-500">Stashed:</span> {selected.isStashed ? "Yes" : "No"}</div>
                                <div><span className="text-gray-500">Image:</span> {selected.imageStatus || "READY"}</div>
                            </div>
                        </div>

                        {selected.item?.description && (
                            <div className="mt-4 text-xs text-gray-400 border-t border-white/10 pt-3">
                                {selected.item.description}
                            </div>
                        )}

                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="bg-black/40 border border-white/10 rounded p-3">
                                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Instance Stats</div>
                                {selectedStats && Object.keys(selectedStats).length > 0 ? (
                                    <div className="space-y-1 text-xs text-gray-300">
                                        {Object.entries(selectedStats).map(([key, value]) => (
                                            <div key={key} className="flex justify-between">
                                                <span className="text-gray-500">{key}</span>
                                                <span className="font-mono text-white">{String(value)}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-xs text-gray-500">No stat overrides.</div>
                                )}
                            </div>
                            <div className="bg-black/40 border border-white/10 rounded p-3">
                                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Visual Traits</div>
                                {selectedTraits && typeof selectedTraits === "object" ? (
                                    <div className="space-y-1 text-xs text-gray-300">
                                        {Object.entries(selectedTraits as Record<string, any>).map(([key, value]) => (
                                            <div key={key} className="flex justify-between">
                                                <span className="text-gray-500">{key}</span>
                                                <span className="font-mono text-white">{String(value)}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : selectedTraits ? (
                                    <div className="text-xs text-gray-300">{selectedTraits}</div>
                                ) : (
                                    <div className="text-xs text-gray-500">No traits recorded.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
