"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ArrowDownUp, Search, ShoppingBag, Filter, Coins, Hexagon, Plus, Dices, Box } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/ui/Toast";
import SafeImage from "@/components/ui/SafeImage";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

// Gamba Logic moved to PrinterInterface

function MarketTicker({ version }: { version?: number }) {
    const [history, setHistory] = useState<any[]>([]);
    const [txFilter, setTxFilter] = useState("ALL");

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const res = await fetch('/api/market/history');
                const data = await res.json();
                if (Array.isArray(data)) setHistory(data);
            } catch (e) { console.error(e); }
        };
        fetchHistory();
        const interval = setInterval(fetchHistory, 10000); // 10s poll
        return () => clearInterval(interval);
    }, [version]);

    const getItemCategory = (item: any) => {
        const type = (item?.type || "").toLowerCase();
        if (type.includes("weapon")) return "WEAPON";
        if (type.includes("armor") || type.includes("suit")) return "ARMOR";
        if (type.includes("consumable")) return "CONSUMABLE";
        if (type.includes("material")) return "MATERIAL";
        return "OTHER";
    };

    const filteredHistory = useMemo(() => {
        if (txFilter === "ALL") return history;
        return history.filter((tx) => getItemCategory(tx.item) === txFilter);
    }, [history, txFilter]);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-widest text-gray-500">
                <span>Filter</span>
                <select
                    value={txFilter}
                    onChange={(event) => setTxFilter(event.target.value)}
                    className="bg-black/40 border border-white/10 rounded px-2 py-1 text-[10px] text-white"
                >
                    <option value="ALL">All</option>
                    <option value="WEAPON">Weapons</option>
                    <option value="ARMOR">Armor</option>
                    <option value="CONSUMABLE">Consumables</option>
                    <option value="MATERIAL">Materials</option>
                    <option value="OTHER">Other</option>
                </select>
            </div>
            <div className="max-h-[420px] overflow-y-auto custom-scrollbar pr-1 space-y-3">
                {filteredHistory.map((tx: any) => (
                    <div key={tx.id} className="text-xs border-b border-white/5 pb-2">
                        <div className="flex justify-between text-gray-400">
                            <span>{new Date(tx.timestamp).toLocaleString()}</span>
                            <span className="text-neon-cyan">{tx.price} <Coins className="inline w-2 h-2" /></span>
                        </div>
                        <div className="text-white font-bold truncate">{tx.item.name}</div>
                        <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                            <span>{tx.seller?.name || "Unknown"}</span>
                            <span>-&gt;</span>
                            <span>{tx.buyer?.name || "Unknown"}</span>
                        </div>
                    </div>
                ))}
                {filteredHistory.length === 0 && <div className="text-gray-600 text-xs italic">No info available</div>}
            </div>
        </div>
    );
}

export default function MarketInterface({ initialListings, userInventory, credits, voidTokens }: any) {
    const [activeTab, setActiveTab] = useState("market"); // market, sell, printer
    const [listings, setListings] = useState(initialListings || []);
    const [marketFilterTab, setMarketFilterTab] = useState("ALL");
    const [marketSortKey, setMarketSortKey] = useState("RARITY");
    const [marketSortDir, setMarketSortDir] = useState<"ASC" | "DESC">("DESC");
    const [sellFilterTab, setSellFilterTab] = useState("ALL");
    const [sellSortKey, setSellSortKey] = useState("NAME");
    const [sellSortDir, setSellSortDir] = useState<"ASC" | "DESC">("ASC");

    // Regeneration State
    const [regenTarget, setRegenTarget] = useState<any>(null);
    const [regenConfirmOpen, setRegenConfirmOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [genProgress, setGenProgress] = useState(0);

    // Sync listings when server refreshes (router.refresh)
    useEffect(() => {
        if (initialListings) setListings(initialListings);
    }, [initialListings]);

    const [creditsDisplay, setCreditsDisplay] = useState(credits);
    const [txVersion, setTxVersion] = useState(0);
    const { addToast } = useToast();
    const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
    const groupedInventory = useMemo(() => {
        const groups = new Map<string, { item: any; items: any[]; totalQty: number }>();
        (userInventory || []).forEach((inv: any) => {
            if (!inv?.item) return;
            const key = inv.itemId;
            const existing = groups.get(key) || { item: inv.item, items: [], totalQty: 0 };
            existing.items.push(inv);
            existing.totalQty += inv.quantity || 0;
            groups.set(key, existing);
        });
        return Array.from(groups.values()).sort((a, b) => a.item.name.localeCompare(b.item.name));
    }, [userInventory]);
    const rarityRank: Record<string, number> = {
        Common: 1,
        Uncommon: 2,
        Rare: 3,
        Epic: 4,
        Legendary: 5
    };
    const getItemCategory = (item: any) => {
        const type = (item?.type || "").toLowerCase();
        if (type.includes("weapon")) return "WEAPON";
        if (type.includes("armor") || type.includes("suit")) return "ARMOR";
        if (type.includes("consumable")) return "CONSUMABLE";
        if (type.includes("material")) return "MATERIAL";
        return "OTHER";
    };
    const getListingCategory = (listing: any) => getItemCategory(listing?.item);
    const listingCounts = useMemo(() => {
        const counts = { ALL: listings.length, WEAPON: 0, ARMOR: 0, CONSUMABLE: 0, MATERIAL: 0, OTHER: 0 };
        listings.forEach((listing: any) => {
            const key = getListingCategory(listing);
            counts[key as keyof typeof counts] += 1;
        });
        return counts;
    }, [listings]);
    const sellCounts = useMemo(() => {
        const counts = { ALL: groupedInventory.length, WEAPON: 0, ARMOR: 0, CONSUMABLE: 0, MATERIAL: 0, OTHER: 0 };
        groupedInventory.forEach((group: any) => {
            const key = getItemCategory(group.item);
            counts[key as keyof typeof counts] += 1;
        });
        return counts;
    }, [groupedInventory]);
    const filteredListings = useMemo(() => {
        const filtered = marketFilterTab === "ALL"
            ? listings
            : listings.filter((listing: any) => getListingCategory(listing) === marketFilterTab);
        const direction = marketSortDir === "ASC" ? 1 : -1;
        return [...filtered].sort((a, b) => {
            const aName = a?.item?.name || "";
            const bName = b?.item?.name || "";
            const aType = a?.item?.type || "";
            const bType = b?.item?.type || "";
            const aRarity = rarityRank[a?.item?.rarity || "Common"] ?? 1;
            const bRarity = rarityRank[b?.item?.rarity || "Common"] ?? 1;
            const aQty = a?.quantity ?? 0;
            const bQty = b?.quantity ?? 0;
            const aPrice = a?.price ?? 0;
            const bPrice = b?.price ?? 0;

            if (marketSortKey === "NAME") return aName.localeCompare(bName) * direction;
            if (marketSortKey === "TYPE") return aType.localeCompare(bType) * direction;
            if (marketSortKey === "QTY") return (aQty - bQty) * direction;
            if (marketSortKey === "PRICE") return (aPrice - bPrice) * direction;
            if (marketSortKey === "RARITY") return (aRarity - bRarity) * direction;
            return aName.localeCompare(bName) * direction;
        });
    }, [listings, marketFilterTab, marketSortDir, marketSortKey]);
    const filteredGroupedInventory = useMemo(() => {
        const filtered = sellFilterTab === "ALL"
            ? groupedInventory
            : groupedInventory.filter((group: any) => getItemCategory(group.item) === sellFilterTab);
        const direction = sellSortDir === "ASC" ? 1 : -1;
        return [...filtered].sort((a, b) => {
            const aName = a.item?.name || "";
            const bName = b.item?.name || "";
            const aRarity = rarityRank[a.item?.rarity || "Common"] ?? 1;
            const bRarity = rarityRank[b.item?.rarity || "Common"] ?? 1;
            const aQty = a.totalQty ?? 0;
            const bQty = b.totalQty ?? 0;
            if (sellSortKey === "RARITY") return (aRarity - bRarity) * direction;
            if (sellSortKey === "QTY") return (aQty - bQty) * direction;
            return aName.localeCompare(bName) * direction;
        });
    }, [groupedInventory, sellFilterTab, sellSortDir, sellSortKey, rarityRank]);

    // Sell Logic
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [sellPrice, setSellPrice] = useState(100);
    const [sellQty, setSellQty] = useState(1);
    const isStackableSale = selectedItem?.item?.type === "Material" || selectedItem?.item?.type === "Consumable";

    const router = useRouter();

    const handleRegenerate = async () => {
        if (!regenTarget) return;
        setRegenConfirmOpen(false);
        setIsGenerating(true);
        setGenProgress(0);

        try {
            const res = await fetch('/api/items/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemId: regenTarget.item.id,
                    inventoryItemId: regenTarget.id,
                    stats: regenTarget.instanceStats,
                    traits: regenTarget.visualTraits
                })
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
                            if (data.progress) setGenProgress(data.progress);
                            if (data.icon) {
                                setSelectedItem((prev: any) => (prev?.id === regenTarget.id ? { ...prev, customImage: data.icon } : prev));
                                router.refresh();
                                addToast("Art Regeneration Complete", "success");
                            }
                            if (data.error) addToast(`Error: ${data.error}`, "error");
                        } catch (e) { console.error(e); }
                    }
                }
            }
        } catch (e) {
            console.error(e);
            addToast("Art regeneration failed", "error");
        } finally {
            setIsGenerating(false);
            setRegenTarget(null);
        }
    };

    const handleCreateListing = async () => {
        if (!selectedItem) return;
        const quantity = isStackableSale ? sellQty : 1;

        try {
            const res = await fetch('/api/market/listings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemId: selectedItem.itemId,
                    inventoryItemId: selectedItem.id, // Specifc Item ID
                    quantity,
                    price: sellPrice,
                    currency: "CREDITS"
                })
            });

            if (res.ok) {
                setSelectedItem(null);
                setTxVersion(v => v + 1);
                router.refresh(); // Refresh server data
                addToast("Item Listed on Galactic Market", "success");
            } else {
                addToast("Failed to list item", "error");
            }
        } catch (e) { console.error(e); }
    };

    const handleBuy = async (listing: any) => {
        if (creditsDisplay < listing.price) {
            addToast("Insufficient Credits", "error");
            return;
        }

        try {
            const res = await fetch('/api/market/buy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ listingId: listing.id })
            });

            if (res.ok) {
                setCreditsDisplay((prev: number) => prev - listing.price);
                setTxVersion(v => v + 1);
                router.refresh();
                addToast("Purchase Successful", "success");
            } else {
                const data = await res.json();
                addToast(data.error || "Purchase Failed", "error");
            }
        } catch (e) { console.error(e); }
    };

    return (
        <div className="min-h-full p-8 pt-24">
            <ConfirmDialog
                open={regenConfirmOpen}
                title="Regenerate Art"
                message="Rebuild this item image using ComfyUI?"
                confirmLabel="REGENERATE"
                onConfirm={handleRegenerate}
                onCancel={() => {
                    setRegenConfirmOpen(false);
                    setRegenTarget(null);
                }}
                busy={isGenerating}
            />
            {/* Header with Hud */}
            <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-end gap-6 text-white">
                <div>
                    <h1 className="text-4xl font-bold tracking-widest neon-text mb-2 flex items-center">
                        <ShoppingBag className="mr-3 h-8 w-8 text-neon-cyan" /> GALACTIC MARKET
                    </h1>
                    <div className="flex gap-4 text-sm font-mono text-gray-400">
                        <span className="flex items-center gap-2"><Coins className="w-4 h-4 text-yellow-400" /> {creditsDisplay}</span>
                        <span className="flex items-center gap-2"><Hexagon className="w-4 h-4 text-neon-magenta" /> {voidTokens}</span>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button onClick={() => setActiveTab("market")} variant={activeTab === "market" ? "primary" : "ghost"}>Buy</Button>
                    <Button onClick={() => setActiveTab("sell")} variant={activeTab === "sell" ? "primary" : "ghost"}>Sell</Button>
                </div>
            </header>

            <div className="max-w-7xl mx-auto">
                {activeTab === "market" && (
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                        {/* Listings Column */}
                        <div className="lg:col-span-3 flex flex-col gap-4 min-h-0">
                            <div className="glass-panel p-4 rounded-xl border border-white/10 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
                                    {[
                                        { id: "ALL", label: "All", count: listingCounts.ALL },
                                        { id: "WEAPON", label: "Weapons", count: listingCounts.WEAPON },
                                        { id: "ARMOR", label: "Armor", count: listingCounts.ARMOR },
                                        { id: "CONSUMABLE", label: "Consumables", count: listingCounts.CONSUMABLE },
                                        { id: "MATERIAL", label: "Materials", count: listingCounts.MATERIAL },
                                        { id: "OTHER", label: "Other", count: listingCounts.OTHER }
                                    ].map((tab) => (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => setMarketFilterTab(tab.id)}
                                            className={`px-2 py-1 rounded border transition ${marketFilterTab === tab.id
                                                ? "border-neon-cyan text-neon-cyan bg-black/40"
                                                : "border-white/10 text-gray-500 hover:border-white/30"
                                                }`}
                                        >
                                            {tab.label} <span className="text-[9px] text-gray-500">({tab.count})</span>
                                        </button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                    <label className="text-[10px] uppercase tracking-widest text-gray-500">Sort</label>
                                    <select
                                        value={marketSortKey}
                                        onChange={(event) => setMarketSortKey(event.target.value)}
                                        className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white"
                                    >
                                        <option value="RARITY">Rarity</option>
                                        <option value="NAME">Name</option>
                                        <option value="TYPE">Type</option>
                                        <option value="QTY">Quantity</option>
                                        <option value="PRICE">Price</option>
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => setMarketSortDir(marketSortDir === "ASC" ? "DESC" : "ASC")}
                                        className="h-7 w-7 flex items-center justify-center rounded border border-white/10 text-gray-400 hover:text-neon-cyan hover:border-neon-cyan"
                                        aria-label="Toggle sort direction"
                                    >
                                        <ArrowDownUp className="h-3 w-3" />
                                    </button>
                                </div>
                            </div>

                            <div className="max-h-[65vh] overflow-y-auto custom-scrollbar pr-2">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {filteredListings.map((listing: any) => (
                                        <motion.div
                                            key={listing.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="glass-panel p-4 rounded-xl flex flex-col items-center text-center relative"
                                        >
                                            <div className={`text-sm font-bold mb-2 ${listing.item.rarity === 'Legendary' ? 'text-neon-magenta' : 'text-neon-cyan'}`}>
                                                {listing.item.rarity}
                                            </div>

                                            <div className="relative group w-24 h-24 mb-2">
                                                <SafeImage
                                                    src={listing.customImage || listing.item.icon}
                                                    alt={listing.item.name}
                                                    className="w-full h-full rounded-lg object-cover border border-white/10 transition-transform duration-300 group-hover:scale-150 group-hover:z-50 group-hover:relative group-hover:shadow-[0_0_20px_rgba(0,255,255,0.5)]"
                                                    fallback={
                                                        <div className="w-20 h-20 bg-black/40 rounded-full flex items-center justify-center border border-white/10">
                                                            <div className="text-2xl font-bold text-white/80">{listing.item.name[0]}</div>
                                                        </div>
                                                    }
                                                />
                                                {/* Stat Tag */}
                                                {listing.instanceStats && (
                                                    <div className="absolute bottom-0 right-0 bg-black/80 text-[8px] text-neon-cyan px-1 rounded-tl border-t border-l border-neon-cyan/30">
                                                        MODDED
                                                    </div>
                                                )}
                                            </div>

                                            <h3 className="text-lg font-bold text-white mb-1">{listing.item.name}</h3>
                                            {listing.seller && (
                                                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">
                                                    SOLD BY {listing.seller.name}
                                                </div>
                                            )}
                                            <div className="text-sm text-gray-400 mb-4">Qty: {listing.quantity}</div>
                                            <Button
                                                className="w-full mt-auto"
                                                disabled={creditsDisplay < listing.price}
                                                onClick={() => handleBuy(listing)}
                                            >
                                                Buy for {listing.price} <Coins className="ml-1 w-3 h-3" />
                                            </Button>
                                        </motion.div>
                                    ))}
                                    {filteredListings.length === 0 && (
                                        <div className="col-span-3 text-center text-gray-500">No matching listings.</div>
                                    )}
                                </div>
                            </div>
                            {listings.length === 0 && <div className="text-center text-gray-500">No active listings. Be the first!</div>}
                        </div>

                        {/* Ticker Sidebar */}
                        <div className="lg:col-span-1">
                            <div className="glass-panel p-6 rounded-xl h-full border-l-2 border-neon-cyan/20">
                                <h3 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-widest">Recent Transactions</h3>
                                <MarketTicker version={txVersion} />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "sell" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="glass-panel p-6 rounded-xl">
                            <h2 className="text-xl font-bold mb-4 flex items-center text-neon-blue"><Box className="mr-2" /> Your Inventory</h2>
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
                                    {[
                                        { id: "ALL", label: "All", count: sellCounts.ALL },
                                        { id: "WEAPON", label: "Weapons", count: sellCounts.WEAPON },
                                        { id: "ARMOR", label: "Armor", count: sellCounts.ARMOR },
                                        { id: "CONSUMABLE", label: "Consumables", count: sellCounts.CONSUMABLE },
                                        { id: "MATERIAL", label: "Materials", count: sellCounts.MATERIAL },
                                        { id: "OTHER", label: "Other", count: sellCounts.OTHER }
                                    ].map((tab) => (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => setSellFilterTab(tab.id)}
                                            className={`px-2 py-1 rounded border transition ${sellFilterTab === tab.id
                                                ? "border-neon-cyan text-neon-cyan bg-black/40"
                                                : "border-white/10 text-gray-500 hover:border-white/30"
                                                }`}
                                        >
                                            {tab.label} <span className="text-[9px] text-gray-500">({tab.count})</span>
                                        </button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                    <label className="text-[10px] uppercase tracking-widest text-gray-500">Sort</label>
                                    <select
                                        value={sellSortKey}
                                        onChange={(event) => setSellSortKey(event.target.value)}
                                        className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white"
                                    >
                                        <option value="NAME">Name</option>
                                        <option value="RARITY">Rarity</option>
                                        <option value="QTY">Quantity</option>
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => setSellSortDir(sellSortDir === "ASC" ? "DESC" : "ASC")}
                                        className="h-7 w-7 flex items-center justify-center rounded border border-white/10 text-gray-400 hover:text-neon-cyan hover:border-neon-cyan"
                                        aria-label="Toggle sort direction"
                                    >
                                        <ArrowDownUp className="h-3 w-3" />
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar">
                                {filteredGroupedInventory.map((group) => {
                                    const isExpanded = expandedItemId === group.item.id;
                                    const isSelectedGroup = selectedItem?.itemId === group.item.id;
                                    return (
                                        <div key={group.item.id} className="rounded border border-white/10 bg-black/40">
                                            <button
                                                type="button"
                                                onClick={() => setExpandedItemId(isExpanded ? null : group.item.id)}
                                                className={`w-full px-3 py-2 flex items-center justify-between text-left transition ${isSelectedGroup ? "border-l-2 border-neon-cyan" : ""}`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-sm text-white">{group.item.name}</span>
                                                    <span className="text-[10px] text-gray-500 uppercase">{group.item.rarity}</span>
                                                </div>
                                                <span className="text-xs text-gray-400">x{group.totalQty}</span>
                                            </button>
                                            {isExpanded && (
                                                <div className="border-t border-white/10">
                                                    {group.items.map((inv) => (
                                                        <button
                                                            key={inv.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedItem(inv);
                                                                setSellQty(1);
                                                            }}
                                                            className={`w-full px-3 py-2 flex items-center gap-3 text-left transition ${selectedItem?.id === inv.id ? "bg-neon-blue/20 border-neon-blue" : "hover:bg-white/5"}`}
                                                        >
                                                            <SafeImage
                                                                src={inv.customImage || inv.item.icon}
                                                                alt={inv.item.name}
                                                                className="w-8 h-8 rounded border border-white/10 object-cover"
                                                                fallback={
                                                                    <div className="w-8 h-8 rounded border border-white/10 flex items-center justify-center text-xs text-gray-400">
                                                                        {inv.item.name?.[0] || "?"}
                                                                    </div>
                                                                }
                                                            />
                                                            <div className="flex-1">
                                                                <div className="text-xs font-bold text-white">{inv.item.name}</div>
                                                                <div className="text-[10px] text-gray-500">{inv.visualTraits || inv.item.type}</div>
                                                            </div>
                                                            <div className="text-[10px] text-gray-400">x{inv.quantity}</div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {filteredGroupedInventory.length === 0 && (
                                    <div className="text-xs text-gray-500 italic">No inventory available.</div>
                                )}
                            </div>
                        </div>

                        {selectedItem && (
                            <div className="glass-panel p-6 rounded-xl animate-in slide-in-from-right-10">
                                <h2 className="text-xl font-bold mb-4">Create Listing</h2>
                                <div className="mb-4">
                                    <label className="block text-xs uppercase text-gray-500 mb-1">Item</label>
                                    <div className="flex items-center gap-4">
                                        <SafeImage
                                            src={selectedItem.customImage || selectedItem.item.icon}
                                            alt="Art"
                                            className="w-16 h-16 rounded border border-white/20 object-cover"
                                            fallback={<Box className="w-5 h-5 text-gray-500" />}
                                        />
                                        <div>
                                            <div className="text-2xl font-bold text-neon-cyan">{selectedItem.item.name}</div>

                                            {/* Unique Stats Display */}
                                            {JSON.parse(selectedItem.instanceStats || '{}').damage && (
                                                <div className="grid grid-cols-2 gap-2 text-xs bg-black/40 p-2 rounded mb-2 border border-white/5">
                                                    <div className="text-gray-400">Damage</div>
                                                    <div className="text-white text-right">{JSON.parse(selectedItem.instanceStats || '{}').damage}</div>
                                                    <div className="text-gray-400">Type</div>
                                                    <div className="text-white text-right">{JSON.parse(selectedItem.instanceStats || '{}').type}</div>
                                                    <div className="col-span-2 text-neon-magenta text-center mt-1 border-t border-white/10 pt-1">
                                                        {selectedItem.visualTraits}
                                                    </div>
                                                </div>
                                            )}

                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-4 mb-6">
                                    <div className="flex-1">
                                        <label className="block text-xs uppercase text-gray-500 mb-1">Price per unit</label>
                                        <Input type="number" value={sellPrice} onChange={(e) => setSellPrice(parseInt(e.target.value))} />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs uppercase text-gray-500 mb-1">Quantity</label>
                                        <Input
                                            type="number"
                                            value={isStackableSale ? sellQty : 1}
                                            max={selectedItem.quantity}
                                            disabled={!isStackableSale}
                                            onChange={(e) => {
                                                const next = parseInt(e.target.value, 10);
                                                if (Number.isNaN(next)) {
                                                    setSellQty(1);
                                                    return;
                                                }
                                                const clamped = Math.max(1, Math.min(next, selectedItem.quantity));
                                                setSellQty(clamped);
                                            }}
                                        />
                                        {!isStackableSale && (
                                            <div className="text-[10px] text-gray-500 mt-1 uppercase tracking-widest">
                                                Single item only
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <Button onClick={handleCreateListing} className="w-full h-12 text-lg">Post Listing</Button>
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}
