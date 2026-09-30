const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const saldosApi = require("./saldos-api");

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const SEED = path.join(ROOT, "data", "accounts.json");
const LOCAL_DB = process.env.DB_PATH || path.join("/tmp", "contabilidad-accounts.json");
const MONGO_URI = process.env.MONGODB_URI || "";
const MONGO_DB = process.env.MONGODB_DB || "contabilidad";
const MONGO_COL = process.env.MONGODB_COLLECTION || "accounts";
const MONGO_ENTRIES = process.env.MONGODB_ENTRIES || "entries";
const LOCAL_ENTRIES = process.env.ENTRIES_PATH || path.join("/tmp", "contabilidad-entries.json");
const MONGO_OPENING = process.env.MONGODB_OPENING || "opening";
const LOCAL_OPENING = process.env.OPENING_PATH || path.join("/tmp", "contabilidad-opening.json");
const NATURES = new Set(["activo", "pasivo", "patrimonio", "resultado", "orden"]);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function seedAccounts() {
  try { return JSON.parse(fs.readFileSync(SEED, "utf8")); } catch { return []; }
}

let colPromise = null;
async function store() {
  if (!MONGO_URI) return null;
  if (!colPromise) {
    colPromise = (async () => {
      const { MongoClient } = require("mongodb");
      const client = new MongoClient(MONGO_URI);
      await client.connect();
      const database = client.db(MONGO_DB);
      const accounts = database.collection(MONGO_COL);
      const entries = database.collection(MONGO_ENTRIES);
      const opening = database.collection(MONGO_OPENING);
      if ((await accounts.countDocuments()) === 0) {
        const seed = seedAccounts();
        if (seed.length) await accounts.insertMany(seed);
      }
      return { accounts, entries, opening };
    })();
  }
  return colPromise;
}

function publicAcc(doc) {
  return {
    id: doc.id, code: doc.code || "", name: doc.name, parentId: doc.parentId || null, nature: doc.nature || "activo",
    representa: doc.representa || "", seDebita: doc.seDebita || "", seAcredita: doc.seAcredita || "",
  };
}
function localRead() {
  try { if (fs.existsSync(LOCAL_DB)) return JSON.parse(fs.readFileSync(LOCAL_DB, "utf8")); } catch {}
  const seed = seedAccounts(); localWrite(seed); return seed;
}
function localWrite(rows) { fs.writeFileSync(LOCAL_DB, JSON.stringify(rows, null, 2)); }
async function allAccounts(db) {
  if (db) return (await db.accounts.find({}, { projection: { _id: 0 } }).toArray()).map(publicAcc);
  return localRead();
}
function localEntries() {
  try { if (fs.existsSync(LOCAL_ENTRIES)) return JSON.parse(fs.readFileSync(LOCAL_ENTRIES, "utf8")); } catch {}
  localWriteEntries([]); return [];
}
function localWriteEntries(rows) { fs.writeFileSync(LOCAL_ENTRIES, JSON.stringify(rows, null, 2)); }
function publicEntry(doc) {
  return { id: doc.id, number: doc.number, date: doc.date, concept: doc.concept, lines: doc.lines || [] };
}
async function allEntries(db) {
  const rows = db ? (await db.entries.find({}, { projection: { _id: 0 } }).toArray()).map(publicEntry) : localEntries();
  rows.sort((a, b) => String(b.number || "").localeCompare(String(a.number || ""), "es", { numeric: true }));
  return rows;
}
function cleanEntry(data, accounts) {
  const date = String(data.date || "").slice(0, 10);
  const concept = String(data.concept || "").trim().slice(0, 160);
  const raw = Array.isArray(data.lines) ? data.lines : [];
  const ids = new Set(accounts.map((a) => a.id));
  const lines = [];
  for (const line of raw) {
    const accountId = String(line.accountId || "");
    const debit = Math.round(Number(line.debit || 0) * 100) / 100;
    const credit = Math.round(Number(line.credit || 0) * 100) / 100;
    if (!accountId && !debit && !credit) continue;
    if (!ids.has(accountId)) return { error: "cuenta" };
    if (debit < 0 || credit < 0) return { error: "importe" };
    if (debit > 0 && credit > 0) return { error: "lado" };
    if (debit === 0 && credit === 0) continue;
    lines.push({ accountId, debit, credit });
  }
  if (!date || !concept) return { error: "datos" };
  if (lines.length < 2) return { error: "renglones" };
  const debe = Math.round(lines.reduce((s, l) => s + l.debit, 0) * 100);
  const haber = Math.round(lines.reduce((s, l) => s + l.credit, 0) * 100);
  if (!debe || debe !== haber) return { error: "balance" };
  return { date, concept, lines };
}
function send(res, status, body, type = TYPES[".json"]) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function body(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
  });
}
function file(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "No encontrado", "text/plain; charset=utf-8");
    send(res, 200, data, TYPES[path.extname(filePath)] || "application/octet-stream");
  });
}
function clean(data, rows, requireParent) {
  const name = String(data.name || "").trim().slice(0, 80);
  const code = String(data.code || "").trim().slice(0, 24);
  const parentId = data.parentId ? String(data.parentId) : null;
  let nature = String(data.nature || "").toLowerCase();
  if (!NATURES.has(nature)) {
    const parent = parentId ? rows.find((a) => a.id === parentId) : null;
    nature = parent ? parent.nature : "activo";
  }
  if (requireParent && !parentId) return { error: "rubro" };
  if (parentId && !rows.some((a) => a.id === parentId)) return { error: "padre" };
  if (!name) return { error: "nombre" };
  return {
    name, code, parentId, nature,
    representa: String(data.representa || "").trim().slice(0, 400),
    seDebita: String(data.seDebita || "").trim().slice(0, 400),
    seAcredita: String(data.seAcredita || "").trim().slice(0, 400),
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const db = await store();
    if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/healthz")) {
      return send(res, 200, { ok: true, store: db ? "mongodb" : "local" });
    }
    if (req.method === "GET" && url.pathname === "/api/accounts") {
      const rows = await allAccounts(db);
      rows.sort((a, b) => String(a.code).localeCompare(String(b.code), "es", { numeric: true }));
      return send(res, 200, rows);
    }
    if (req.method === "POST" && url.pathname === "/api/accounts") {
      const rows = await allAccounts(db);
      const data = clean(await body(req), rows, true);
      if (data.error) return send(res, 400, { error: data.error });
      const acc = { id: "c" + Date.now(), ...data };
      if (db) await db.accounts.insertOne({ ...acc }); else { rows.push(acc); localWrite(rows); }
      return send(res, 201, acc);
    }
    const one = url.pathname.match(/^\/api\/accounts\/([^/]+)$/);
    if (one) {
      const id = one[1];
      const rows = await allAccounts(db);
      const acc = rows.find((a) => a.id === id);
      if (!acc) return send(res, 404, { error: "no" });
      if (req.method === "PATCH") {
        const patch = await body(req);
        const data = clean({ ...acc, ...patch, parentId: acc.parentId }, rows, false);
        if (data.error) return send(res, 400, { error: data.error });
        const next = { ...acc, ...data };
        if (db) await db.accounts.updateOne({ id }, { $set: data });
        else localWrite(rows.map((a) => (a.id === id ? next : a)));
        return send(res, 200, next);
      }
      if (req.method === "DELETE") {
        if (rows.some((a) => a.parentId === id)) return send(res, 409, { error: "hijos" });
        if (db) await db.accounts.deleteOne({ id });
        else localWrite(rows.filter((a) => a.id !== id));
        return send(res, 200, { ok: true });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/entries") return send(res, 200, await allEntries(db));
    if (req.method === "POST" && url.pathname === "/api/entries") {
      const accounts = await allAccounts(db);
      const data = cleanEntry(await body(req), accounts);
      if (data.error) return send(res, 400, { error: data.error });
      const existing = await allEntries(db);
      const nextNum = existing.reduce((n, e) => Math.max(n, Number(String(e.number || "").replace(/\D/g, "")) || 0), 0) + 1;
      const entry = { id: "e" + Date.now(), number: "A-" + String(nextNum).padStart(5, "0"), ...data };
      if (db) await db.entries.insertOne({ ...entry });
      else { const rows = localEntries(); rows.push(entry); localWriteEntries(rows); }
      return send(res, 201, entry);
    }
    const entryOne = url.pathname.match(/^\/api\/entries\/([^/]+)$/);
    if (req.method === "DELETE" && entryOne) {
      const id = entryOne[1];
      if (db) {
        const out = await db.entries.deleteOne({ id });
        return out.deletedCount ? send(res, 200, { ok: true }) : send(res, 404, { error: "no" });
      }
      const rows = localEntries();
      const next = rows.filter((e) => e.id !== id);
      if (next.length === rows.length) return send(res, 404, { error: "no" });
      localWriteEntries(next);
      return send(res, 200, { ok: true });
    }
    if (req.method === "GET" && url.pathname === "/api/opening") {
      return send(res, 200, await saldosApi.getOpening(db, LOCAL_OPENING));
    }
    if (req.method === "PUT" && url.pathname === "/api/opening") {
      const accounts = await allAccounts(db);
      const raw = await body(req);
      const parsed = saldosApi.cleanOpening(raw, accounts);
      if (parsed.error) return send(res, 400, { error: parsed.error });
      const saved = await saldosApi.saveOpening(db, LOCAL_OPENING, { date: parsed.date, lines: parsed.lines });
      return send(res, 200, saved);
    }
    if (req.method === "GET" && url.pathname === "/api/saldos") {
      const accounts = await allAccounts(db);
      const opening = await saldosApi.getOpening(db, LOCAL_OPENING);
      const entries = await allEntries(db);
      return send(res, 200, saldosApi.computeSaldos(accounts, opening, entries));
    }
    const rel = url.pathname === "/" ? "/index.html" : url.pathname;
    const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
    file(res, path.join(PUBLIC, safe));
  } catch (err) {
    console.error(err);
    send(res, 500, { error: "store", detail: String(err.message || err) });
  }
});
server.listen(PORT, HOST, () => {
  console.log(`listening on http://${HOST}:${PORT} store=${MONGO_URI ? "mongodb" : "local"}`);
});
