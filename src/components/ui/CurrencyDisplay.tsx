import { Coins, Hexagon } from "lucide-react";

export default function CurrencyDisplay({ credits, voidTokens }: { credits: number; voidTokens: number }) {
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
        </div>
    );
}
