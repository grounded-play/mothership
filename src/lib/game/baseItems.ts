export type BaseItemSeed = {
    name: string;
    type: string;
    rarity: string;
    icon: string;
    description: string;
    suit?: string | null;
    equipSlot?: string | null;
    slotSize?: number;
    maxUses?: number | null;
    classTag?: string | null;
    minLevel?: number;
};

export const BASE_ITEMS: BaseItemSeed[] = [
    // COMMAND / Marine
    { name: "Plasma Rifle", type: "Weapon", rarity: "Rare", icon: "Crosshair", description: "Standard issue energy weapon.", suit: "COMMAND", equipSlot: "WEAPON", slotSize: 2, maxUses: 3, classTag: "Marine" },
    { name: "Exo Suit", type: "Armor", rarity: "Epic", icon: "Shield", description: "Reinforced exoskeleton armor.", suit: "COMMAND", equipSlot: "ARMOR", slotSize: 2, maxUses: 5, classTag: "Marine" },

    // BIOTECH / Medic
    { name: "Bio Injector", type: "Weapon", rarity: "Rare", icon: "Syringe", description: "Biotech injection weapon.", suit: "BIOTECH", equipSlot: "WEAPON", slotSize: 2, maxUses: 3, classTag: "Medic" },
    { name: "Med Suit", type: "Armor", rarity: "Epic", icon: "Heart", description: "Bio-sealed medical armor.", suit: "BIOTECH", equipSlot: "ARMOR", slotSize: 2, maxUses: 5, classTag: "Medic" },

    // PLASMA / Engineer
    { name: "Arc Cutter", type: "Weapon", rarity: "Rare", icon: "Zap", description: "Industrial plasma cutting tool.", suit: "PLASMA", equipSlot: "WEAPON", slotSize: 2, maxUses: 3, classTag: "Engineer" },
    { name: "Thermal Suit", type: "Armor", rarity: "Epic", icon: "Flame", description: "Thermal shielding armor.", suit: "PLASMA", equipSlot: "ARMOR", slotSize: 2, maxUses: 5, classTag: "Engineer" },

    // VOID / Scout
    { name: "Void Blade", type: "Weapon", rarity: "Rare", icon: "Sword", description: "Void-tuned melee blade.", suit: "VOID", equipSlot: "WEAPON", slotSize: 2, maxUses: 3, classTag: "Scout" },
    { name: "Phase Cloak", type: "Armor", rarity: "Epic", icon: "Eye", description: "Phase-shifted stealth cloak.", suit: "VOID", equipSlot: "ARMOR", slotSize: 2, maxUses: 5, classTag: "Scout" },

    // Misc
    { name: "Admin Key Card", type: "Key", rarity: "Artifact", icon: "Key", description: "Opens all doors." },
    { name: "Scrap Metal", type: "Material", rarity: "Common", icon: "Box", description: "Useful for repairs." },
    { name: "Nutrient Paste", type: "Consumable", rarity: "Common", icon: "Utensils", description: "Barely edible." },
    { name: "Void Crystal", type: "Material", rarity: "Legendary", icon: "Gem", description: "Glowing with dark energy." },
    { name: "Exosuit Component", type: "Material", rarity: "Epic", icon: "Component", description: "High-tech plating." }
];
