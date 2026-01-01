Mothership Card Ops
===================

Sci-fi, phased card tactics built on Next.js. Players draw, lock actions, and react to a hostile station:

- **Draw phase**: Everyone draws 1 card. Shared AP pool resets to base 3 + number of players (+1 per participant draw). Some statuses may add extra card/AP; negative effects can block gains.
- **Action phase (15s)**: Players must lock an intent (scan, secure, move, fight) and a card combo before the timer ends. Each card costs 1 AP from the shared pool; multiple cards increase strength and cost. If a player doesn’t lock, the lowest card auto-locks with a default scan.
- **Reaction phase**: Rooms have suit/power; monsters patrol. Locked cards are compared to room power/suit to resolve scans, securing rooms, movement, or fights. Successful scans can reveal better loot with stronger cards; securing beats room power to hold it longer. Failures escalate room difficulty and can alert monsters.
- **Objectives**: Secure rooms, find loot, and beat the main objective (doubles/triples needed based on difficulty vs room power).

Quickstart
----------
1) Install deps: `npm install`
2) Ensure env: `.env` contains `DATABASE_URL=file:./dev.db`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL=http://localhost:3000`
3) DB sync (after schema changes): `npx prisma db push` then `npx prisma generate` (stop any running dev server if the Prisma DLL is locked)
4) Run dev server: `npm run dev` and open http://localhost:3000

Notes
-----
- SQLite lives at `prisma/dev.db`; seed data includes sample users/items.
- Art generation uses ComfyUI at `127.0.0.1:8188`; start that service if you need art features.
