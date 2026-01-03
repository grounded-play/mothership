import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
    // 1. Create Base Items
    const items = [
        { name: "Plasma Rifle", type: "Weapon", rarity: "Rare", icon: "Crosshair", description: "Standard issue energy weapon.", suit: "COMMAND", equipSlot: "WEAPON", slotSize: 2, maxUses: 3, classTag: "Marine" },
        { name: "Exo Suit", type: "Armor", rarity: "Rare", icon: "Shield", description: "Reinforced exoskeleton armor.", suit: "COMMAND", equipSlot: "ARMOR", slotSize: 2, maxUses: 5, classTag: "Marine" },
        { name: "Bio Injector", type: "Weapon", rarity: "Rare", icon: "Syringe", description: "Biotech injection weapon.", suit: "BIOTECH", equipSlot: "WEAPON", slotSize: 2, maxUses: 3, classTag: "Medic" },
        { name: "Med Suit", type: "Armor", rarity: "Rare", icon: "Heart", description: "Bio-sealed medical armor.", suit: "BIOTECH", equipSlot: "ARMOR", slotSize: 2, maxUses: 5, classTag: "Medic" },
        { name: "Arc Cutter", type: "Weapon", rarity: "Rare", icon: "Zap", description: "Industrial plasma cutting tool.", suit: "PLASMA", equipSlot: "WEAPON", slotSize: 2, maxUses: 3, classTag: "Engineer" },
        { name: "Thermal Suit", type: "Armor", rarity: "Rare", icon: "Flame", description: "Thermal shielding armor.", suit: "PLASMA", equipSlot: "ARMOR", slotSize: 2, maxUses: 5, classTag: "Engineer" },
        { name: "Void Blade", type: "Weapon", rarity: "Rare", icon: "Sword", description: "Void-tuned melee blade.", suit: "VOID", equipSlot: "WEAPON", slotSize: 2, maxUses: 3, classTag: "Scout" },
        { name: "Phase Cloak", type: "Armor", rarity: "Rare", icon: "Eye", description: "Phase-shifted stealth cloak.", suit: "VOID", equipSlot: "ARMOR", slotSize: 2, maxUses: 5, classTag: "Scout" },
        { name: "Admin Key Card", type: "Key", rarity: "Artifact", icon: "Key", description: "Opens all doors." },
        { name: "Scrap Metal", type: "Material", rarity: "Common", icon: "Box", description: "Useful for repairs." },
        { name: "Void Crystal", type: "Material", rarity: "Legendary", icon: "Gem", description: "Glowing with dark energy." },
        { name: "Nutrient Paste", type: "Consumable", rarity: "Common", icon: "Utensils", description: "Barely edible." },
        { name: "Exosuit Component", type: "Material", rarity: "Epic", icon: "Component", description: "High-tech plating." },
    ]

    for (const item of items) {
        await prisma.item.upsert({
            where: { name: item.name },
            update: {},
            create: item,
        })
    }

    // 2. Create Admin User
    const email = 'admin@mothership.com'
    const password = 'password123'
    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
            email,
            password: hashedPassword,
            role: 'ADMIN',
        },
    })

    // 3. Create Admin Character
    const adminChar = await prisma.character.upsert({
        where: {
            userId_name: {
                userId: user.id,
                name: 'Commander'
            }
        },
        update: {
            credits: 99999,
            voidTokens: 500
        },
        create: {
            name: 'Commander',
            class: 'Marine',
            level: 100,
            credits: 99999,
            voidTokens: 500,
            userId: user.id,
            stats: JSON.stringify({ str: 20, agi: 20, int: 20 }),
        },
    })

    // 4. Give Admin Items
    const plasmaRifle = await prisma.item.findUnique({ where: { name: "Plasma Rifle" } })
    const keyCard = await prisma.item.findUnique({ where: { name: "Admin Key Card" } })

    const seedStackable = async (item: any) => {
        const existing = await prisma.inventoryItem.findFirst({
            where: { characterId: adminChar.id, itemId: item.id }
        })
        if (existing) {
            await prisma.inventoryItem.update({
                where: { id: existing.id },
                data: { quantity: 1 }
            })
        } else {
            await (prisma as any).inventoryItem.create({
                data: {
                    characterId: adminChar.id,
                    itemId: item.id,
                    quantity: 1,
                    usesRemaining: item.maxUses ?? null,
                    usesMax: item.maxUses ?? null
                }
            })
        }
    }

    if (plasmaRifle) {
        await seedStackable(plasmaRifle)
    }

    if (keyCard) {
        await seedStackable(keyCard)
    }

    console.log("Seeding complete.")
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
