
export const WEAPON_PREFIXES = [
    "Standard Issue", "Rusty", "Chrome", "Void-touched", "Precision", "Heavy", "Tactical", "Scrap-built", "Prototype"
];

export const CONDITIONS = [
    "Factory New", "Battle-scarred", "Corroded", "Pristine", "Glitching", "Overheated"
];

export const COLORS = [
    "Gunmetal Grey", "Warning Yellow", "Void Black", "Laser Red", "Plasma Blue", "Toxic Green", "Neon Pink", "White Enamel"
];

export const DAMAGE_TYPES = ["Physical", "Energy", "Void", "Fire", "Acid", "Shock"];

export function rollD10() {
    return Math.floor(Math.random() * 10) + 1;
}

export function rollTraits(type: string): string {
    const prefix = WEAPON_PREFIXES[Math.floor(Math.random() * WEAPON_PREFIXES.length)];
    const condition = CONDITIONS[Math.floor(Math.random() * CONDITIONS.length)];
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];

    return `${prefix}, ${condition}, ${color} finish`;
}

export function rollStats(type: string): any {
    if (type === 'Weapon') {
        const dmgDice = Math.floor(Math.random() * 3) + 1; // 1 to 3
        const dmgSide = [4, 6, 10, 20][Math.floor(Math.random() * 4)];

        return {
            damage: `${dmgDice}d${dmgSide}`,
            critEffect: ["Impale", "Knockdown", "Stun", "Dismember", "Ignite"][Math.floor(Math.random() * 5)],
            shots: rollD10(),
            type: DAMAGE_TYPES[Math.floor(Math.random() * DAMAGE_TYPES.length)]
        };
    }

    if (type === 'Armor') {
        return {
            ap: Math.floor(Math.random() * 5) + 1, // Armor Points
            saveBonus: `+${Math.floor(Math.random() * 10)}%`
        };
    }

    return {};
}

export function generatePromptAdditions(stats: any, traits: string): string {
    // Convert stats to visual cues for the prompt
    let prompt = traits;
    if (stats.type) prompt += `, ${stats.type} energy effect`;
    if (stats.damage) prompt += `, heavy calibre`;
    return prompt;
}
