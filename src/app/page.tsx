import AuthForm from "@/components/auth/AuthForm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findUserBySessionEmail } from "@/lib/sessionUser";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await getServerSession(authOptions);

  const user = await findUserBySessionEmail(session?.user?.email);

  if (user) {
    redirect("/menu");
  }

  return (
    <main className="flex min-h-full flex-col items-center justify-center relative p-4">

      <div className="z-10 w-full flex flex-col items-center animate-in fade-in zoom-in duration-1000 slide-in-from-bottom-10">
        <div className="text-center mb-12 w-full px-4">
          <h1 className="text-[12vw] md:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 tracking-tighter whitespace-nowrap select-none"
            style={{ textShadow: "0 0 30px rgba(0, 243, 255, 0.3)" }}>
            MOTHERSHIP
          </h1>
          <p className="text-neon-cyan tracking-[0.5em] text-sm mt-2 uppercase opacity-80 animate-pulse">
            System Online
          </p>
        </div>

        <div className="w-full max-w-md">
          <AuthForm />
        </div>
      </div>
    </main>
  );
}
