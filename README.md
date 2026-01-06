# Mothership Card Ops

**Mothership Card Ops** is a tactical sci-fi extraction shooter blending deck-building mechanics with real-time multiplayer tension. Players assume the role of scavengers (Marines, Androids, Scientists, Teamsters) exploring a hostile, procedurally generated derelict spacecraft.

![Screenshot](public/screenshot.png)

## Core Gameplay Loop

1.  **Preparation**: Create a character, roll for stats, and 3D print your ID badge. Equip your loadout from the persistent inventory.
2.  **Deployment**: Join a lobby with up to 4 players. Deploy to the Mothership.
3.  **Turn-Based Tactics (Simultaneous)**:
    -   **Draw Phase**: Draw cards from your personal deck.
    -   **Action Phase (15s Timer)**: You have 15 seconds to lock in your move. Play cards to power your actions (Move, Scan, Attack, Secure). Synergize card suits (Biotech, Plasma, Command, Void) with room types for bonuses.
    -   **Resolution**: The server resolves all player actions and enemy AI movement simultaneously.
4.  **Fog of War**: Use the **Scanner** to reveal hidden room data (Integrity, Suit, Loot). Unscanned rooms are dangerous unknowns.
5.  **Extraction**: Find loot, complete objectives, and reach the airlock to bank your rewards. Death means losing your carried loadout.

## Key Features

### 🛠️ Systems & Mechanics
-   **Class System**: 4 distinctive classes with unique stat distributions (STR, AGI, INT).
-   **Card-Based Action**: Actions require card investments. Higher ranks (Jack, Queen, King) power stronger moves.
-   **Fog of War Navigation**: A fully realized 3D Room Scanner visualizes local geometry (Doors, Windows, Hatches) only after scanning.
-   **Persistent Economy**:
    -   **Credits & Void Tokens**: Currencies earned from runs.
    -   **Market**: Buy/Sell items. Includes a "Slot Machine" mechanic for rare item rolls.
    -   **3D Printer**: An asynchronous crafting queue. Queue up items or character portraits and check back later when they are "printed".

### 🎨 Visuals & Immersion
-   **Generative Art (AI)**: Integrated **ComfyUI** pipeline generating unique, consistent art for characters, enemies, and loot items on the fly.
-   **Retro-Futurism**: A sleek, dark UI aesthetic inspired by CRT displays, neon overlays, and tactical terminals.
-   **Dynamic Animations**: Powered by `framer-motion` for smooth card interactions, scanning effects, and UI transitions.

## Tech Stack

-   **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
-   **Database**: SQLite (Dev) / Postgres (Prod) via [Prisma ORM](https://www.prisma.io/)
-   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
-   **Real-time**: Polling-based synchronization with server-authoritative state.
-   **AI Integration**: Custom API routes interfacing with local [ComfyUI](https://github.com/comfyanonymous/ComfyUI) instance.

## Getting Started

### 1. Prerequisites
-   Node.js (v18+)
-   (Optional) ComfyUI running locally on port `8188` for art generation.

### 2. Installation
```bash
git clone https://github.com/your-username/mothership-card-ops.git
cd mothership-card-ops
npm install
```

### 3. Configuration
Create a `.env` file in the root directory:
```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"
```

### 4. Database Setup
```bash
npx prisma db push
npx prisma generate
npm run seed  # Optional: Populates initial items/monsters
```

### 5. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to launch the interface.

## Project Structure

-   `src/app`: Next.js App Router pages (Game, Market, Character, etc.).
-   `src/components`: Reusable UI components (SectorGrid, RoomScanner, CardHand).
-   `src/lib`: Utilities for Game Logic, ID generation (`nanoid`), and Art Generation (`comfy`).
-   `prisma`: Database schema and seed scripts.

## License

MIT License.
