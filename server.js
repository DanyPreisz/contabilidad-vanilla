const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const SEED = path.join(ROOT, "data", "accounts.json");
const LOCAL_DB = process.env.DB_PATH || path.join("/tmp", "contabilidad-accounts.json");
const MONGO_URI = process.env.MONGODB_URI || "";
const MONGO_DB = process.env.MONGODB_DB || "contabilidad";
const MONGO_COL = process.env.MONGODB_COLLECTION || "accounts";
const NATURES = new Set(["activo", "pasivo", "patrimonio", "resultado", "orden"]);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function seedAccounts() {
  try {
    return JSON.parse(fs.readFileSync(SEED, "utf8"));
  } catch {
    return [];
  }
}

let colPromise = null;

async function collection() {
  if (!MONGO_URI) return null;
  if (!colPromise) {
    colPromise = (async () => {
      const { MongoClient } = require("mongodb");
      const client = new MongoClient(MONGO_URI);
      await client.connect();
      const col = client.db(MONGO_DB).collection(MONGO_COL);
      if ((await col.countDocuments()) === 0) {
        const seed = seedAccounts();
        if (seed.length) await col.insertMany(seed);
      }
      return col;
    })();
  }
  return colPromise;
}

function publicAcc(doc) {
  return {
    id: doc.id,
    code: doc.code || "",
    name: doc.name,
    parentId: doc.parentId || null,
    nature: doc.nature || "activo",
  };
}

function localRead() {
  try {
    if (fs.existsSync(LOCAL_DB)) return JSON.parse(fs.readFileSync(LOCAL_DB, "utf8"));
  } catch {}
  const seed = seedAccounts();
  localWrite(seed);
  return seed;
}

function localWrite(rows) {
  fs.writeFileSync(LOCAL_DB, JSON.stringify(rows, null, 2));
}

async function all(col) {
  if (col) return (await col.find({}, { projection: { _id: 0 } }).toArray()).map(publicAcc);
  return localRead();
}

function send(res, status, body, type = TYPES[".json"]) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function body(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function file(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "No encontrado", "text/plain; charset=utf-8");
    send(res, 200, data, TYPES[path.extname(filePath)] || "application/octet-stream");
  });
}

function clean(data, rows) {
  const name = String(data.name || "").trim().slice(0, 80);
  const code = String(data.code || "").trim().slice(0, 24);
  const parentId = data.parentId ? String(data.parentId) : null;
  let nature = String(data.nature || "").toLowerCase();
  if (!NATURES.has(nature)) {
    const parent = parentId ? rows.find((a) => a.id === parentId) : null;
    nature = parent ? parent.nature : "activo";
  }
  if (parentId && !rows.some((a) => a.id === parentId)) return { error: "padre" };
  if (!name) return { error: "nombre" };
  return { name, code, parentId, nature };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const col = await collection();

    if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/healthz")) {
      return send(res, 200, { ok: true, store: col ? "mongodb" : "local" });
    }

    if (req.method === "GET" && url.pathname === "/api/accounts") {
      return send(res, 200, await all(col));
    }

    if (req.method === "POST" && url.pathname === "/api/accounts") {
      const rows = await all(col);
      const data = clean(await body(req), rows);
      if (data.error) return send(res, 400, { error: data.error });
      const acc = { id: "c" + Date.now(), ...data };
      if (col) await col.insertOne({ ...acc });
      else {
        rows.push(acc);
        localWrite(rows);
      }
      return send(res, 201, acc);
    }

    const one = url.pathname.match(/^\/api\/accounts\/([^/]+)$/);
    if (one) {
      const id = one[1];
      const rows = await all(col);
      const acc = rows.find((a) => a.id === id);
      if (!acc) return send(res, 404, { error: "no" });

      if (req.method === "PATCH") {
        const data = clean({ ...acc, ...(await body(req)) }, rows);
        if (data.error) return send(res, 400, { error: data.error });
        if (data.parentId === id) return send(res, 400, { error: "ciclo" });
        const next = { ...acc, ...data };
        if (col) await col.updateOne({ id }, { $set: data });
        else localWrite(rows.map((a) => (a.id === id ? next : a)));
        return send(res, 200, next);
      }

      if (req.method === "DELETE") {
        if (rows.some((a) => a.parentId === id)) return send(res, 409, { error: "hijos" });
        if (col) await col.deleteOne({ id });
        else localWrite(rows.filter((a) => a.id !== id));
        return send(res, 200, { ok: true });
      }
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
