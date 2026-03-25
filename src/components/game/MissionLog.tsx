import React from 'react';

interface Objective {
    id: string;
    type: string;
    description: string;
    target: any;
    current?: any;
    isComplete: boolean;
}

interface MissionLogProps {
    objectives: Objective[];
    compact?: boolean;
    className?: string;
}

export default function MissionLog({ objectives, compact = false, className = "" }: MissionLogProps) {
    const completedCount = objectives.filter((obj) => obj.isComplete).length;

    if (compact) {
        return (
            <div className={`rounded-xl border border-white/10 bg-black/60 px-3 py-2 ${className}`}>
                <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-[9px] font-bold uppercase tracking-[0.28em] text-neon-cyan">Mission Objectives</h3>
                    <div className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[8px] font-mono uppercase tracking-[0.22em] text-gray-400">
                        {completedCount}/{objectives.length || 0} done
                    </div>
                </div>
                <div className="space-y-2">
                    {objectives.map((obj) => (
                        <div
                            key={obj.id}
                            className={`rounded-lg border px-2.5 py-2 ${
                                obj.isComplete
                                    ? "border-green-500/30 bg-green-500/10"
                                    : "border-white/10 bg-black/40"
                            }`}
                        >
                            <div className="flex items-start gap-2">
                                <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${obj.isComplete ? "bg-green-400" : "bg-gray-600 animate-pulse"}`} />
                                <div className="min-w-0 flex-1">
                                    <div className={`text-[10px] font-mono leading-tight ${obj.isComplete ? "text-green-300 line-through" : "text-gray-200"}`}>
                                        {obj.description}
                                    </div>
                                    {obj.current !== undefined && (
                                        <div className="mt-1 text-[9px] uppercase tracking-[0.18em] text-gray-500">
                                            {obj.current} / {obj.target}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    {objectives.length === 0 && (
                        <div className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-[10px] uppercase tracking-[0.22em] text-gray-500">
                            No Active Protocols
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={`bg-black/80 border border-gray-800 rounded p-4 mb-4 ${className}`}>
            <h3 className="text-neon-cyan text-xs font-bold tracking-widest mb-3 uppercase">Mission Protocols</h3>
            <div className="space-y-3">
                {objectives.map(obj => (
                    <div key={obj.id} className="flex items-start gap-2">
                        <div className={`mt-1 w-2 h-2 rounded-full ${obj.isComplete ? 'bg-green-500' : 'bg-gray-600 animate-pulse'}`} />
                        <div>
                            <div className={`${obj.isComplete ? 'text-green-500 line-through' : 'text-gray-300'} text-xs font-mono`}>
                                {obj.description}
                            </div>
                            {obj.current !== undefined && (
                                <div className="text-[10px] text-gray-500">
                                    Progress: {obj.current} / {obj.target}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {objectives.length === 0 && <div className="text-gray-600 text-xs">No Active Protocols</div>}
            </div>
        </div>
    );
}
