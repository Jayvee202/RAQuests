// Le franchises.json, consulta o RetroAchievements e gera data/status.json.
// Uso local:  RA_API_KEY=sua_chave node fetch-ra.mjs   (Node 18+)
import { readFile, writeFile, mkdir } from "node:fs/promises";

const KEY = process.env.RA_API_KEY;
if (!KEY) {
  console.error("Defina a variavel RA_API_KEY.");
  process.exit(1);
}

const config = JSON.parse(await readFile("franchises.json", "utf8"));
const USER = config.user; // perfil acompanhado
const API_USER = config.apiUser ?? config.user; // dono da chave de API
if (API_USER.includes("TROQUE")) {
  console.error('Edite "apiUser" no franchises.json com o usuario da conta que gerou a chave.');
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(endpoint, params) {
  const qs = new URLSearchParams({ z: API_USER, y: KEY, ...params });
  const res = await fetch(`https://retroachievements.org/API/${endpoint}.php?${qs}`);
  if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`);
  return res.json();
}

// Titulo e badge ja buscados ficam em cache.
const cache = {};
try {
  const old = JSON.parse(await readFile("data/status.json", "utf8"));
  for (const f of old.franchises) for (const g of f.games) cache[g.id] = g;
} catch {}

// Status por jogo a partir dos premios: "hardcore" ou "softcore".
// Premio de beaten ou de maestria/completo conta como zerado.
// AwardDataExtra: 1 = hardcore, 0 = softcore.
const awards = (await api("API_GetUserAwards", { u: USER })).VisibleUserAwards ?? [];
const status = new Map();
for (const a of awards) {
  if (a.AwardType !== "Game Beaten" && a.AwardType !== "Mastery/Completion") continue;
  const id = Number(a.AwardData);
  const mode = Number(a.AwardDataExtra) === 1 ? "hardcore" : "softcore";
  if (status.get(id) !== "hardcore") status.set(id, mode);
}

const franchises = [];
for (const f of config.franchises) {
  const games = [];
  for (const id of f.games) {
    let info = cache[id];
    if (!info?.title) {
      const g = await api("API_GetGame", { i: id });
      info = {
        title: g.Title,
        console: g.ConsoleName,
        icon: g.ImageIcon ? `https://media.retroachievements.org${g.ImageIcon}` : "",
      };
      await sleep(400);
    }
    games.push({
      id,
      title: info.title,
      console: info.console,
      icon: info.icon,
      // "manual" no franchises.json tem prioridade: {"1448": "hardcore"}
      beaten: config.manual?.[id] ?? status.get(id) ?? null,
    });
  }
  franchises.push({ name: f.name, games });
}

await mkdir("data", { recursive: true });
await writeFile(
  "data/status.json",
  JSON.stringify({ user: USER, updated: new Date().toISOString(), franchises }, null, 2)
);
console.log(`Salvo: ${franchises.length} franquia(s) em data/status.json`);
