# Mothership Card Ops

Mothership Card Ops is a multiplayer sci-fi extraction game built in Next.js. It mixes deck-driven action selection, simultaneous turn resolution, fog-of-war exploration, persistent inventory, and a local ComfyUI-backed printer pipeline for item and character art.

![Screenshot](public/screenshot.png)

## Core Loop

1. Create a character and load out gear.
2. Join a lobby with up to 4 players.
3. Enter the ship, draw cards, and lock an action during the timed action phase.
4. Resolve movement, scans, attacks, and security actions simultaneously.
5. Extract with loot before the station kills you.

## Tech Stack

- Next.js 16
- React 19
- Prisma
- SQLite in local development
- Tailwind CSS
- Framer Motion
- ComfyUI for local image generation

## Project Layout

- `src/app` - routes, API handlers, and top-level pages
- `src/components` - UI and gameplay components
- `src/lib` - game rules, printer worker, ComfyUI integration, helpers
- `src/workflows` - ComfyUI workflow JSON used by the app
- `prisma` - schema and local DB config
- `ComfyUI` - bundled local ComfyUI checkout plus helper scripts

## Local App Setup

### Prerequisites

- Node.js 22 recommended
- npm
- Python 3.10+ if you want local ComfyUI generation

### Install

```bash
npm install
```

### Environment

Create `.env` in the repo root:

```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="replace-this-with-a-real-secret"
NEXTAUTH_URL="http://localhost:3000"
```

### Database

```bash
npx prisma db push
npx prisma generate
```

### Run the Game

```bash
npm run dev
```

Open `http://localhost:3000`.

### Production Build Check

```bash
npm run build
```

## ComfyUI Setup

The app expects a local ComfyUI server at:

- `http://127.0.0.1:8188`
- `ws://127.0.0.1:8188/ws`

Those endpoints are hard-coded in [src/lib/comfy.ts](src/lib/comfy.ts) and used by the printer/status routes.

### Required Models for the Current Workflows

The current item and character workflows in `src/workflows/*.json` expect these exact filenames:

| File | Put it here |
| --- | --- |
| `flux2_dev_fp8mixed.safetensors` | `ComfyUI/models/unet/` |
| `flux2-vae.safetensors` | `ComfyUI/models/vae/` |
| `mistral_3_small_flux2_bf16.safetensors` | `ComfyUI/models/clip/` |

These names must match exactly unless you also update:

- `src/workflows/item_generator.json`
- `src/workflows/character_generator.json`
- `ComfyUI/download_flux2.py`

### Model Source

The bundled downloader pulls all three files from the gated Hugging Face repo:

- `Comfy-Org/flux2-dev`

Before downloading, accept the model license on Hugging Face and create a read token.

### Fastest Model Install

#### Windows

```powershell
cd ComfyUI
.\download_flux2.bat
```

#### Linux

```bash
cd ComfyUI
python3 download_flux2.py
```

The downloader will prompt for a Hugging Face token if needed.

### Launch ComfyUI

#### Windows

If the bundled virtualenv is already set up:

```powershell
cd ComfyUI
.\start_comfyui.bat
```

Manual equivalent:

```powershell
cd ComfyUI
.\venv\Scripts\activate
python main.py
```

#### Linux

If this repo was copied from a Windows machine, rebuild the venv on Linux first:

```bash
cd ComfyUI
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python3 download_flux2.py
chmod +x start_comfyui.sh
./start_comfyui.sh
```

If the Linux venv already exists:

```bash
cd ComfyUI
./start_comfyui.sh
```

Manual equivalent:

```bash
cd ComfyUI
source venv/bin/activate
python3 main.py
```

### Low-VRAM Note

The current workflows use FLUX2-family assets. On 8 GB GPUs they can run, but they may spill to system RAM and feel slow. If ComfyUI struggles to start or generate, try:

```bash
python main.py --lowvram
```

### Verify ComfyUI Is Online

Once ComfyUI is up, verify the API responds:

```bash
curl http://127.0.0.1:8188/
```

Or open `http://127.0.0.1:8188` in a browser.

## Printer Pipeline Notes

- The app starts the printer worker automatically when the Next.js server boots.
- There is no separate printer daemon to launch for local development.
- Generated files are copied into:
  - `public/items`
  - `public/characters`
- Raw ComfyUI outputs also appear under `ComfyUI/output`

## Common Problems

### Printer says ComfyUI is offline

Check:

1. ComfyUI is actually running on port `8188`
2. The three required model files exist in the expected subfolders
3. Your local firewall is not blocking loopback access

### Linux launch fails after copying the repo from Windows

The Windows `venv` will not run on Linux. Recreate it:

```bash
cd ComfyUI
rm -rf venv
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Art generation queues but never finishes

Check:

- `printer-worker.log`
- `ComfyUI/output`
- the ComfyUI console for missing model errors
- that the workflow filenames still match the installed models

## Useful Commands

```bash
npm run dev
npm run build
npx prisma db push
npx prisma generate
```

## License

MIT
