"use client";

// No more fixed scaling logic. The app is now fully responsive.
// The container mimics a "device" or "window" on large screens,
// and fills the screen on mobile devices.

export default function AppFrame({ children }: { children: React.ReactNode }) {
    return (
        <div className="app-frame w-full min-h-screen bg-stone-950 flex justify-center">
            <div className="w-full max-w-[1700px] min-h-screen bg-black border-x border-white/5 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative flex flex-col">
                {children}
            </div>
        </div>
    );
}
