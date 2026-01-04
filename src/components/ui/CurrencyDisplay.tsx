import { Coins, Hexagon, Box, Droplet } from "lucide-react";

type CurrencyDisplayProps = {
    credits: number;
    voidTokens: number;
    scrap?: number;
    paste?: number;
};

export default function CurrencyDisplay({ credits, voidTokens, scrap, paste }: CurrencyDisplayProps) {
    return (
        <div className="flex gap-4">
            <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded border border-neon-cyan/30 text-neon-cyan">
                <Coins className="w-4 h-4" />
                <span className="font-mono text-sm">{credits.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded border border-neon-magenta/30 text-neon-magenta">
                <Hexagon className="w-4 h-4" />
                <span className="font-mono text-sm">{voidTokens.toLocaleString()}</span>
            </div>
            {typeof scrap === "number" && (
                <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded border border-amber-500/30 text-amber-400">
                    <Box className="w-4 h-4" />
                    <span className="font-mono text-sm">{scrap.toLocaleString()}</span>
                </div>
            )}
            {typeof paste === "number" && (
                <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded border border-emerald-500/30 text-emerald-400">
                    <Droplet className="w-4 h-4" />
                    <span className="font-mono text-sm">{paste.toLocaleString()}</span>
                </div>
            )}
        </div>
    );
}
