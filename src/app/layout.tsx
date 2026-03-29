import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050510",
  interactiveWidget: "resizes-content",
};

const audioBootstrap = `
(() => {
  try {
    const settingsKey = "mothership.audio.settings.v2";
    const playbackKey = "mothership.audio.playback.v1";
    const tracks = { default: "/audio/default.mp3", intense: "/audio/intense.mp3" };
    const ids = { default: "mothership-music-default", intense: "mothership-music-intense" };
    const defaults = {
      masterEnabled: true,
      musicEnabled: true,
      masterVolume: 0.72,
      musicVolume: 0.58
    };
    const rawSettings = window.localStorage.getItem(settingsKey);
    const parsedSettings = rawSettings ? JSON.parse(rawSettings) : {};
    const settings = { ...defaults, ...parsedSettings };
    const rawPlayback = window.sessionStorage.getItem(playbackKey);
    const playback = rawPlayback ? JSON.parse(rawPlayback) : {};
    const path = window.location.pathname || "/";
    const inMission = path.startsWith("/game/") && !path.endsWith("/summary");
    const scene = path === "/" || path.startsWith("/api/") ? "silent" : (inMission ? "intense" : "default");
    const level = settings.masterEnabled && settings.musicEnabled
      ? Math.max(0, Math.min(1, Number(settings.masterVolume || 0) * Number(settings.musicVolume || 0)))
      : 0;

    Object.keys(tracks).forEach((track) => {
      let audio = document.getElementById(ids[track]) || document.createElement("audio");
      if (!audio.id) {
        audio.id = ids[track];
        audio.setAttribute("aria-hidden", "true");
        audio.style.position = "fixed";
        audio.style.width = "0";
        audio.style.height = "0";
        audio.style.opacity = "0";
        audio.style.pointerEvents = "none";
        audio.style.left = "-9999px";
        document.body.appendChild(audio);
      }

      if (audio.getAttribute("src") !== tracks[track]) {
        audio.setAttribute("src", tracks[track]);
      }
      audio.loop = true;
      audio.preload = "auto";
      audio.autoplay = true;
      audio.muted = true;
      audio.volume = 0;
      audio.setAttribute("playsinline", "true");

      const snapshotTime = playback?.times?.[track];
      if (Number.isFinite(snapshotTime)) {
        try {
          audio.currentTime = Math.max(0, Number(snapshotTime));
        } catch {}
      }

      const playPromise = audio.play?.();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    });

    Object.keys(tracks).forEach((track) => {
      const audio = document.getElementById(ids[track]);
      if (!audio) return;
      const targetVolume = scene === track ? level : 0;
      audio.volume = targetVolume;
      audio.muted = targetVolume <= 0.0005;
      if (scene === "silent" && !audio.paused) {
        audio.pause();
      }
    });
  } catch {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  ensurePrinterWorker();
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-[100dvh] w-full overflow-hidden bg-black text-white`}>
        <Script id="mothership-audio-bootstrap" strategy="beforeInteractive">
          {audioBootstrap}
        </Script>
        <AuthProvider>
          <ToastProvider>
            <AppFrame>{children}</AppFrame>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
