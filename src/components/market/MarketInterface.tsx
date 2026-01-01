"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Search, ShoppingBag, Filter, Coins, Hexagon, Plus, Dices, Box } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/ui/Toast";

// Gamba Logic moved to PrinterInterface

function MarketTicker({ version }: { version?: number }) {
    const [history, setHistory] = useState<any[]>([]);

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

    return (
        <div className="space-y-3">
            {history.map((tx: any) => (
                <div key={tx.id} className="text-xs border-b border-white/5 pb-2">
                    <div className="flex justify-between text-gray-400">
                        <span>{new Date(tx.timestamp).toLocaleTimeString()}</span>
                        <span className="text-neon-cyan">{tx.price} <Coins className="inline w-2 h-2" /></span>
                    </div>
                    <div className="text-white font-bold truncate">{tx.item.name}</div>
                    <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                        <span>{tx.seller?.name || "Unknown"}</span>
                        <span>➔</span>
                        <span>{tx.buyer?.name || "Unknown"}</span>
                    </div>
                </div>
            ))}
            {history.length === 0 && <div className="text-gray-600 text-xs italic">No info available</div>}
        </div>
    );
}

export default function MarketInterface({ initialListings, userInventory, credits, voidTokens }: any) {
    const [activeTab, setActiveTab] = useState("market"); // market, sell, printer
    const [listings, setListings] = useState(initialListings || []);

    // Sync listings when server refreshes (router.refresh)
    useEffect(() => {
        if (initialListings) setListings(initialListings);
    }, [initialListings]);

    const [creditsDisplay, setCreditsDisplay] = useState(credits);
    const [txVersion, setTxVersion] = useState(0);
    const { addToast } = useToast();

    // Sell Logic
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [sellPrice, setSellPrice] = useState(100);
    const [sellQty, setSellQty] = useState(1);

    // Generation State
    const [isGenerating, setIsGenerating] = useState(false);
    const [genProgress, setGenProgress] = useState(0);

    const router = useRouter();

    const handleCreateListing = async () => {
        if (!selectedItem) return;

        try {
            const res = await fetch('/api/market/listings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemId: selectedItem.itemId,
                    inventoryItemId: selectedItem.id, // Specifc Item ID
                    quantity: sellQty,
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
        <div className="min-h-screen p-8 pt-24">
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
                        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {listings.map((listing: any) => (
                                <motion.div
                                    key={listing.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="glass-panel p-4 rounded-xl flex flex-col items-center text-center relative"
                                >
                                    <div className={`text-sm font-bold mb-2 ${listing.item.rarity === 'Legendary' ? 'text-neon-magenta' : 'text-neon-cyan'}`}>
                                        {listing.item.rarity}
                                    </div>

                                    {listing.item.icon?.startsWith('/items/') ? (
                                        <div className="relative group w-24 h-24 mb-2">
                                            <img
                                                src={listing.customImage || listing.item.icon}
                                                alt={listing.item.name}
                                                className="w-full h-full rounded-lg object-cover border border-white/10 transition-transform duration-300 group-hover:scale-150 group-hover:z-50 group-hover:relative group-hover:shadow-[0_0_20px_rgba(0,255,255,0.5)]"
                                            />
                                            {/* Stat Tag */}
                                            {listing.instanceStats && (
                                                <div className="absolute bottom-0 right-0 bg-black/80 text-[8px] text-neon-cyan px-1 rounded-tl border-t border-l border-neon-cyan/30">
                                                    MODDED
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="w-20 h-20 bg-black/40 rounded-full flex items-center justify-center mb-4 border border-white/10">
                                            <div className="text-2xl font-bold text-white/80">{listing.item.name[0]}</div>
                                        </div>
                                    )}

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
                            {listings.length === 0 && <div className="col-span-3 text-center text-gray-500">No active listings. Be the first!</div>}
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
                            <div className="space-y-2 max-h-[500px] overflow-y-auto">
                                {userInventory.map((inv: any) => (
                                    <div key={inv.id}
                                        onClick={() => setSelectedItem(inv)}
                                        className={`p-3 rounded border cursor-pointer transition-all flex justify-between items-center ${selectedItem?.id === inv.id ? 'bg-neon-blue/20 border-neon-blue' : 'bg-black/40 border-white/5 hover:border-white/20'}`}
                                    >
                                        <span className="font-bold">{inv.item.name}</span>
                                        <span className="text-sm text-gray-400">x{inv.quantity}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {selectedItem && (
                            <div className="glass-panel p-6 rounded-xl animate-in slide-in-from-right-10">
                                <h2 className="text-xl font-bold mb-4">Create Listing</h2>
                                <div className="mb-4">
                                    <label className="block text-xs uppercase text-gray-500 mb-1">Item</label>
                                    <div className="flex items-center gap-4">
                                        {(selectedItem.customImage || selectedItem.item.icon)?.startsWith('/items/') && (
                                            <img src={selectedItem.customImage || selectedItem.item.icon} alt="Art" className="w-16 h-16 rounded border border-white/20" />
                                        )}
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

                                            {/* Progress Bar for Generation */}
                                            {isGenerating && (
                                                <div className="w-full mt-2 space-y-1">
                                                    <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                                                        <motion.div
                                                            className="h-full bg-neon-cyan"
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${genProgress}%` }}
                                                        />
                                                    </div>
                                                    <div className="flex justify-between text-[10px] text-gray-500 uppercase">
                                                        <span>Uplink Active</span>
                                                        <span>{genProgress}%</span>
                                                    </div>
                                                </div>
                                            )}

                                            <Button
                                                variant="outline"
                                                className="h-6 text-xs mt-1 border-neon-cyan/50 text-neon-cyan hover:bg-neon-cyan/20"
                                                disabled={isGenerating}
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    if (!confirm("Regenerate Art using ComfyUI?")) return;

                                                    setIsGenerating(true);
                                                    setGenProgress(0);

                                                    try {
                                                        const res = await fetch('/api/items/generate', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({
                                                                itemId: selectedItem.item.id,
                                                                inventoryItemId: selectedItem.id, // Pass Instance ID
                                                                stats: selectedItem.instanceStats,
                                                                traits: selectedItem.visualTraits
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
                                                                            // Update specific instance image if returned
                                                                            selectedItem.customImage = data.icon;
                                                                            // Fallback to item icon if null? No, customImage takes precedence.
                                                                            router.refresh();
                                                                            addToast("Art Regeneration Complete", "success");
                                                                        }
                                                                        if (data.error) addToast("Error: " + data.error, "error");
                                                                    } catch (e) { console.error(e); }
                                                                }
                                                            }
                                                        }
                                                    } catch (e) { console.error(e); }
                                                    finally { setIsGenerating(false); }
                                                }}
                                            >
                                                {isGenerating ? "GENERATING..." : "GENERATE ART (COMFY)"}
                                            </Button>
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
                                        <Input type="number" value={sellQty} max={selectedItem.quantity} onChange={(e) => setSellQty(parseInt(e.target.value))} />
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
