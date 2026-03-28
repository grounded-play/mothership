import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import { BASE_ITEMS } from '../src/lib/game/baseItems'

const prisma = new PrismaClient()

async function main() {
    // 1. Create Base Items
    for (const item of BASE_ITEMS) {
        await prisma.item.upsert({
            where: { name: item.name },
            update: {
                type: item.type,
                rarity: item.rarity,
                icon: item.icon,
                description: item.description,
                suit: item.suit ?? null,
                equipSlot: item.equipSlot ?? null,
                slotSize: item.slotSize ?? 1,
                maxUses: item.maxUses ?? null,
                classTag: item.classTag ?? null,
                minLevel: item.minLevel ?? 1
            },
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

    // 3.5. Create Tutorial Guide - Amy (Cybernetic Gorilla)
    const amyChar = await prisma.character.upsert({
        where: {
            userId_name: {
                userId: user.id,
                name: 'Amy'
            }
        },
        update: {
            level: 1,
            credits: 150,
            voidTokens: 0,
            runsCompleted: 0,
            runsFailed: 0,
            deathCount: 0,
            deepestLevel: 0,
            loreNotes: "Cybernetic gorilla. Formerly a test subject at the Institute of Synthetic Biology. Built for labor in high-risk environments. Now serves as the Mothership's tutorial guide.",
            serviceRecord: JSON.stringify([
                { date: "2150-06-15", event: "Subject Alpha-721 created" },
                { date: "2154-03-22", event: "Transferred to Mothership project" },
                { date: "2158-09-10", event: "Assigned as tutorial guide" }
            ]),
            loadoutContext: JSON.stringify({
                equippedWeapon: null,
                equippedArmor: null,
                backpack: ["Repair Kit", "Stim Pack"],
                specialTrait: "Superior strength and durability"
            })
        },
        create: {
            name: 'Amy',
            class: 'Marine',
            level: 1,
            portrait: null,
            portraitStatus: 'READY',
            credits: 150,
            voidTokens: 0,
            stats: JSON.stringify({
                strength: 18,
                speed: 14,
                intellect: 10,
                combat: 15,
                instinct: 20
            }),
            deathCount: 0,
            runsCompleted: 0,
            runsFailed: 0,
            deepestLevel: 0,
            serviceRecord: JSON.stringify([
                { date: "2150-06-15", event: "Subject Alpha-721 created" },
                { date: "2154-03-22", event: "Transferred to Mothership project" },
                { date: "2158-09-10", event: "Assigned as tutorial guide" }
            ]),
            loadoutContext: JSON.stringify({
                equippedWeapon: null,
                equippedArmor: null,
                backpack: ["Repair Kit", "Stim Pack"],
                specialTrait: "Superior strength and durability"
            }),
            loreNotes: "Cybernetic gorilla. Formerly a test subject at the Institute of Synthetic Biology. Built for labor in high-risk environments. Now serves as the Mothership's tutorial guide.",
            userId: user.id
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
