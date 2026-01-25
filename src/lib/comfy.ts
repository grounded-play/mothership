import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';

const COMFY_API = "http://127.0.0.1:8188";
const COMFY_WS = "ws://127.0.0.1:8188/ws";
// Helper to get workflow based on type
function getWorkflow(type: 'item' | 'character' = 'item') {
    const filename = type === 'character' ? 'character_generator.json' : 'item_generator.json';
    const workflowPath = path.join(process.cwd(), 'src', 'workflows', filename);

    if (!fs.existsSync(workflowPath)) {
        throw new Error(`Workflow file not found at ${workflowPath}`);
    }
    return JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
}

export async function generateItemArt(
    prompt: string,
    id: string,
    type: 'item' | 'character' = 'item',
    onProgress?: (progress: { value: number, max: number, step?: number }) => void
): Promise<string | null> {
    const clientId = "mothership_client_" + Math.random().toString(36).substring(7);
    const ws = new WebSocket(`${COMFY_WS}?clientId=${clientId}`);

    return new Promise((resolve, reject) => {
        ws.on('open', async () => {
            try {
                const workflow = getWorkflow(type);


                // Inject Prompt
                if (workflow["6"] && workflow["6"].inputs) {
                    const style = type === 'character'
                        ? "Sci-fi character portrait, Mothership RPG style, gritty, deep space, detailed face, digital painting"
                        : "Mothership RPG style, deep space pirate hacker green terminal text style, MTG playing card style item, digital art";

                    workflow["6"].inputs.text = `${style}, ${prompt}, high quality`;
                } else {
                    throw new Error("Invalid Workflow: Missing Node 6 (CLIPTextEncode)");
                }

                // Random Seed
                const seed = Math.floor(Math.random() * 1000000000);
                if (workflow["25"]) workflow["25"].inputs.noise_seed = seed;

                // Filename Prefix
                if (workflow["9"]) workflow["9"].inputs.filename_prefix = `${type}_${id}_${seed}`;

                // Queue Prompt
                const res = await fetch(`${COMFY_API}/prompt`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: workflow, client_id: clientId })
                });

                if (!res.ok) throw new Error("Failed to queue prompt");
                const { prompt_id } = await res.json();

                // Listen for Completion & Progress
                ws.on('message', async (data) => {
                    const msg = JSON.parse(data.toString());

                    if (msg.type === 'progress' && msg.data.value !== undefined && msg.data.max !== undefined) {
                        if (onProgress) onProgress({ value: msg.data.value, max: msg.data.max });
                    }

                    if (msg.type === 'executing' && msg.data.node === null && msg.data.prompt_id === prompt_id) {
                        try {
                            const historyRes = await fetch(`${COMFY_API}/history/${prompt_id}`);
                            const historyData = await historyRes.json();
                            const outputData = historyData[prompt_id]?.outputs;

                            if (!outputData || !outputData["9"]) {
                                ws.close();
                                reject(new Error("Generation failed: No output for Node 9"));
                                return;
                            }

                            const images = outputData["9"].images;
                            if (images && images.length > 0) {
                                const imgInfo = images[0];
                                const filename = imgInfo.filename;

                                // Download Image
                                const imgRes = await fetch(`${COMFY_API}/view?filename=${filename}&subfolder=${imgInfo.subfolder}&type=${imgInfo.type}`);
                                const buffer = await imgRes.arrayBuffer();

                                // Save locally
                                const folderName = type === 'character' ? 'characters' : 'items';
                                const publicDir = path.join(process.cwd(), 'public', folderName);
                                if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

                                const localFilename = `${id}.png`;
                                const localPath = path.join(publicDir, localFilename);

                                fs.writeFileSync(localPath, Buffer.from(buffer));

                                ws.close();
                                resolve(`/${folderName}/${localFilename}`);
                            } else {
                                ws.close();
                                reject(new Error("No image output found"));
                            }
                        } catch (e) {
                            ws.close();
                            reject(e);
                        }
                    }
                });

            } catch (e) {
                ws.close();
                reject(e);
            }
        });

        ws.on('error', (e) => {
            console.error("WebSocket Error", e);
            ws.close();
            reject(e);
        });

        ws.on('close', (code, reason) => {
            if (code !== 1000) { // Normal closure
                console.warn(`WebSocket closed prematurely: ${code} ${reason}`);
                reject(new Error("WebSocket closed prematurely"));
            }
        });
    });
}
