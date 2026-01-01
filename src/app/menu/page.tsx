import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import MainMenu from "@/components/menu/MainMenu";
import CurrencyDisplay from "@/components/ui/CurrencyDisplay";

export default async function MenuPage() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        redirect("/");
    }

    let userId = session.user.id;

    // Backfill logic if id missing from session types (safety)
    if (!userId) {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } });
        if (user) userId = user.id;
    }

    let character = null;

    if (userId) {
        character = await prisma.character.findFirst({
            where: { userId: userId },
        });

        if (!character) {
            redirect("/character/create");
        }
    }

    return (
        <>
            <div className="absolute top-4 right-4 z-50">
                <CurrencyDisplay credits={character?.credits || 0} voidTokens={character?.voidTokens || 0} />
            </div>
            <MainMenu />
        </>
    );
}
