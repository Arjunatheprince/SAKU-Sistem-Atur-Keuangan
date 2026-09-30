import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(file = ".env.local") {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;
  const rows = readFileSync(path, "utf8").split(/\r?\n/);
  for (const row of rows) {
    const line = row.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const raw = line.slice(eq + 1).trim();
    const value = raw.replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const PORT = Number(process.env.ASSISTANT_PROXY_PORT || 8787);
const API_KEY = process.env.AI_API_KEY || "";
const API_URL = process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.AI_MODEL || "gpt-4o-mini";

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function sendJson(res, status, body, origin = "") {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": allowedOrigins.has(origin) ? origin : "http://localhost:5173",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolveReq, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 16_384) {
        reject(new Error("Payload terlalu besar."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolveReq(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("JSON tidak valid."));
      }
    });
  });
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return JSON.parse(trimmed);
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI tidak mengembalikan JSON.");
  return JSON.parse(match[0]);
}

function validateResult(result) {
  const action = result.action;
  if (!["transaction", "monthlyBudget", "categoryBudget"].includes(action)) {
    throw new Error("Field action tidak valid.");
  }
  const amount = Math.round(Number(result.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Field amount tidak valid.");

  if (action === "monthlyBudget") return { action, amount };

  if (action === "categoryBudget") {
    const category = String(result.category || "Lain-Lain").trim() || "Lain-Lain";
    return { action, amount, category };
  }

  const type = result.type === "income" ? "income" : "expense";
  const category = String(result.category || "Lain-Lain").trim() || "Lain-Lain";
  const name = String(result.name || category).trim() || category;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(result.date || "") ? result.date : new Date().toISOString().slice(0, 10);
  const note = String(result.note || "").trim();
  return { action, type, amount, category, name, date, note };
}

function buildPrompt({ command, today, activeMonth }) {
  return [
    "Kamu adalah parser perintah keuangan untuk aplikasi SAKU.",
    "Balas hanya JSON valid, tanpa markdown.",
    "Tentukan salah satu action: transaction, monthlyBudget, categoryBudget.",
    "Penting: jika ada kata batas, anggaran, budget, limit, atau plafon, jangan jadikan transaksi.",
    "Gunakan format tanggal YYYY-MM-DD.",
    `Tanggal hari ini: ${today}. Bulan aktif: ${activeMonth}.`,
    "Kategori pengeluaran umum: Makanan, Transportasi, Belanja, Tagihan, Hiburan, Kesehatan, Pendidikan, Investasi, Lain-Lain.",
    "Kategori pemasukan umum: Gaji, Bonus, Freelance, Bisnis, Investasi, Hadiah, Lain-Lain.",
    "Schema transaction: {\"action\":\"transaction\",\"type\":\"expense|income\",\"amount\":20000,\"category\":\"Makanan\",\"name\":\"makan\",\"date\":\"YYYY-MM-DD\",\"note\":\"\"}",
    "Schema monthlyBudget: {\"action\":\"monthlyBudget\",\"amount\":1000000}",
    "Schema categoryBudget: {\"action\":\"categoryBudget\",\"category\":\"Makanan\",\"amount\":200000}",
    `Perintah user: ${command}`,
  ].join("\n");
}

async function callAssistant(payload) {
  if (!API_KEY) throw new Error("AI_API_KEY belum diisi di .env.local.");
  const command = String(payload.command || "").trim();
  if (!command) throw new Error("Perintah kosong.");

  const today = payload.today || new Date().toISOString().slice(0, 10);
  const activeMonth = payload.activeMonth || today.slice(0, 7);
  const prompt = buildPrompt({ command, today, activeMonth });

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: "Return only valid JSON." },
        { role: "user", content: prompt },
      ],
    }),
  });

  const raw = await response.text();
  if (!response.ok) throw new Error(`AI API ${response.status}: ${raw.slice(0, 500)}`);

  const data = JSON.parse(raw);
  const content = data?.choices?.[0]?.message?.content ?? data?.output_text ?? raw;
  return validateResult(extractJson(content));
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";

  if (req.method === "OPTIONS") return sendJson(res, 204, {}, origin);
  if (req.method === "GET" && req.url === "/health") {
    return sendJson(res, 200, { ok: true, configured: Boolean(API_KEY), model: MODEL }, origin);
  }
  if (req.method !== "POST" || req.url !== "/api/assistant") {
    return sendJson(res, 404, { error: "Not found" }, origin);
  }

  try {
    const payload = await readJson(req);
    const result = await callAssistant(payload);
    return sendJson(res, 200, { ok: true, result }, origin);
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message }, origin);
  }
});

server.listen(PORT, () => {
  console.log(`SAKU assistant proxy: http://localhost:${PORT}`);
  console.log(`AI model: ${MODEL}`);
  console.log(API_KEY ? "AI_API_KEY: loaded" : "AI_API_KEY: missing (.env.local)");
});

