import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../components/auth/AuthProvider";
import { ToastProvider } from "@/components/ui/Toast";
import ResponsiveShell from "@/components/layout/ResponsiveShell";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "MOTHERSHIP: Void Protocol",
  description: "Roguelike Deckbuilder Extraction Horror",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-black text-white overflow-hidden h-[100dvh]`}>
        <AuthProvider>
          <ToastProvider>
            <ResponsiveShell>{children}</ResponsiveShell>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
