import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../components/auth/AuthProvider";
import { ToastProvider } from "@/components/ui/Toast";
import AppFrame from "@/components/ui/AppFrame";
import { ensurePrinterWorker } from "@/lib/printerWorker";

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
  ensurePrinterWorker();
  return (
    <html lang="en">
      <body className={`${inter.className} bg-black text-white h-full w-full overflow-hidden`}>
        <AuthProvider>
          <ToastProvider>
            <AppFrame>{children}</AppFrame>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
