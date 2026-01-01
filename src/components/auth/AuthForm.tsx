"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Lock, Mail, Loader2, UserPlus, LogIn } from "lucide-react";

export default function AuthForm() {
    const [isLogin, setIsLogin] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        setError("");

        const formData = new FormData(e.currentTarget);
        const email = formData.get("email") as string;
        const password = formData.get("password") as string;

        if (isLogin) {
            const result = await signIn("credentials", {
                redirect: false,
                email,
                password,
            });

            if (result?.error) {
                setError("Invalid credentials");
                setIsLoading(false);
            } else {
                router.push("/menu"); // Redirect to menu on success
                router.refresh();
            }
        } else {
            // Register logic
            try {
                const res = await fetch("/api/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password }),
                });

                if (res.ok) {
                    // Auto login after register
                    await signIn("credentials", {
                        redirect: false,
                        email,
                        password,
                    });
                    router.push("/menu");
                    router.refresh();
                } else {
                    const data = await res.json();
                    setError(data.error || "Registration failed");
                    setIsLoading(false);
                }
            } catch (err) {
                setError("Something went wrong");
                setIsLoading(false);
            }
        }
    };

    return (
        <div className="w-full max-w-md p-8 glass-panel rounded-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-neon-cyan to-transparent opacity-50" />

            <div className="text-center mb-8">
                <h2 className="text-3xl font-bold tracking-widest uppercase neon-text text-white">
                    {isLogin ? "System Access" : "New Iteration"}
                </h2>
                <p className="text-gray-400 text-sm mt-2">
                    {isLogin ? "Authenticate to proceed" : "Initialize new pilot data"}
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <div className="relative">
                        <Mail className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                        <Input
                            name="email"
                            type="email"
                            placeholder="Pilot ID (Email)"
                            className="pl-10"
                            required
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <div className="relative">
                        <Lock className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                        <Input
                            name="password"
                            type="password"
                            placeholder="Access Code"
                            className="pl-10"
                            required
                            minLength={6}
                        />
                    </div>
                </div>

                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-red-400 text-sm text-center bg-red-950/30 p-2 rounded border border-red-500/20"
                    >
                        {error}
                    </motion.div>
                )}

                <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-12 text-lg tracking-widest"
                >
                    {isLoading ? (
                        <Loader2 className="animate-spin h-5 w-5" />
                    ) : isLogin ? (
                        <>
                            <LogIn className="mr-2 h-5 w-5" /> Authenticate
                        </>
                    ) : (
                        <>
                            <UserPlus className="mr-2 h-5 w-5" /> Initialize
                        </>
                    )}
                </Button>
            </form>

            <div className="mt-6 text-center">
                <button
                    onClick={() => {
                        setIsLogin(!isLogin);
                        setError("");
                    }}
                    className="text-sm text-neon-cyan hover:text-white transition-colors hover:underline decoration-neon-cyan underline-offset-4"
                >
                    {isLogin
                        ? "No credentials? Request access"
                        : "Already initialized? Return to login"}
                </button>
            </div>
        </div>
    );
}
