export const SUITS = {
    COMMAND: { label: "COMMAND", color: "text-green-500", border: "border-green-500", bg: "bg-green-500/10" },
    PLASMA: { label: "PLASMA", color: "text-orange-500", border: "border-orange-500", bg: "bg-orange-500/10" },
    BIOTECH: { label: "BIOTECH", color: "text-red-500", border: "border-red-500", bg: "bg-red-500/10" },
    VOID: { label: "VOID", color: "text-purple-500", border: "border-purple-500", bg: "bg-purple-500/10" },
    ANOMALY: { label: "ANOMALY", color: "text-white", border: "border-white", bg: "bg-white/10" }
} as const;

export type SuitType = keyof typeof SUITS;

export function getSuitConfig(suitName: string | null | undefined) {
    if (!suitName) return null;
    const key = suitName.toUpperCase() as SuitType;
    return SUITS[key] || { label: suitName, color: "text-gray-400", border: "border-gray-400", bg: "bg-gray-800" };
}

export function getSuitBadge(suitName: string | null | undefined, small = false) {
    const config = getSuitConfig(suitName);
    if (!config) return null;
    return {
        ...config,
        className: `${config.color} ${config.border} ${config.bg} rounded px-1 border ${small ? 'text-[8px]' : 'text-[10px] font-bold'}`
    };
}
