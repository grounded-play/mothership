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
