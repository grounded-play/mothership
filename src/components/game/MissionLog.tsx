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
}

export default function MissionLog({ objectives }: MissionLogProps) {
    return (
        <div className="bg-black/80 border border-gray-800 rounded p-4 mb-4">
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
