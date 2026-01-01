import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
    // 1. Create Base Items
    const items = [
        { name: "Plasma Rifle", type: "Weapon", rarity: "Rare", icon: "Crosshair", description: "Standard issue energy weapon." },
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
            class: 'Pilot',
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

    if (plasmaRifle) {
        await prisma.inventoryItem.upsert({
            where: { characterId_itemId: { characterId: adminChar.id, itemId: plasmaRifle.id } },
            update: { quantity: 1 },
            create: { characterId: adminChar.id, itemId: plasmaRifle.id, quantity: 1 }
        })
    }

    if (keyCard) {
        await prisma.inventoryItem.upsert({
            where: { characterId_itemId: { characterId: adminChar.id, itemId: keyCard.id } },
            update: { quantity: 1 },
            create: { characterId: adminChar.id, itemId: keyCard.id, quantity: 1 }
        })
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
