import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findUserBySessionEmail, touchUserByEmail } from "@/lib/sessionUser";
import { redirect } from "next/navigation";
import MainMenu from "@/components/menu/MainMenu";
import CurrencyDisplay from "@/components/ui/CurrencyDisplay";
import StatusPanel from "@/components/menu/StatusPanel";
import AutoFitViewport from "@/components/layout/AutoFitViewport";
import { getMenuStatusSnapshot } from "@/lib/menuStatus";

export default async function MenuPage() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        redirect("/");
    }

    const user = await findUserBySessionEmail(session.user.email);
    if (!user) {
        redirect("/");
    }

    await touchUserByEmail(user.email);

    const {
        character,
        lastRun,
        globalLastRun,
        lastTransaction,
        lastPrint,
        totalPlayers,
        onlinePlayers,
        activeMissions,
        activeLobbies,
        comfyStatus,
    } = await getMenuStatusSnapshot(user.id);

    if (!character) {
        redirect("/character/create");
    }

    return (
        <main className="h-full w-full overflow-hidden px-4 py-4 sm:px-5 sm:py-5">
            <div className="mx-auto flex h-full w-full max-w-[1500px] min-h-0 flex-col">
                <AutoFitViewport contentKey={`menu-${character.id}-${activeMissions}-${activeLobbies}`}>
                    <div className="grid h-[680px] min-w-[1240px] w-full grid-cols-[320px_minmax(0,1fr)] gap-5">
                        <section className="flex h-full min-h-0 flex-col">
                            <StatusPanel
                                character={character}
                                lastRun={lastRun}
                                globalLastRun={globalLastRun}
                                lastTransaction={lastTransaction}
                                lastPrint={lastPrint}
                                totalPlayers={totalPlayers}
                                onlinePlayers={onlinePlayers}
                                activeMissions={activeMissions}
                                activeLobbies={activeLobbies}
                                comfyStatus={comfyStatus}
                            />
                        </section>

                        <section className="flex h-full min-h-0 flex-col gap-5">
                            <div className="flex shrink-0 items-center justify-end">
                                <CurrencyDisplay credits={character?.credits || 0} voidTokens={character?.voidTokens || 0} />
                            </div>
                            <div className="min-h-0 flex-1">
                                <MainMenu />
                            </div>
                        </section>
                    </div>
                </AutoFitViewport>
            </div>
        </main>
    );
}
