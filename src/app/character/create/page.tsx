import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import CreateCharacterForm from "@/components/character/CreateCharacterForm";
import { authOptions } from "@/lib/auth";
import { findUserBySessionEmail } from "@/lib/sessionUser";

export default async function CreateCharacterPage() {
    const session = await getServerSession(authOptions);
    const user = await findUserBySessionEmail(session?.user?.email);

    if (!user) {
        redirect("/");
    }

    return (
        <div className="min-h-full flex items-center justify-center p-4">
            <CreateCharacterForm />
        </div>
    );
}
