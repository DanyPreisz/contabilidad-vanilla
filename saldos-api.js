const fs = require("node:fs");

function emptyOpening() {
  return { id: "apertura", date: "", lines: [] };
}

function localOpening(file) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  const empty = emptyOpening();
  fs.writeFileSync(file, JSON.stringify(empty, null, 2));
  return empty;
}

async function getOpening(db, file) {
  if (db && db.opening) {
    const doc = await db.opening.findOne({ id: "apertura" }, { projection: { _id: 0 } });
    return doc || emptyOpening();
  }
  return localOpening(file);
}

async function saveOpening(db, file, data) {
  const doc = { id: "apertura", date: data.date || "", lines: data.lines || [] };
  if (db && db.opening) {
    await db.opening.updateOne({ id: "apertura" }, { $set: doc }, { upsert: true });
    return doc;
  }
  fs.writeFileSync(file, JSON.stringify(doc, null, 2));
  return doc;
}

function debitNormal(acc) {
  if (acc.nature === "activo") return true;
  if (acc.nature === "pasivo" || acc.nature === "patrimonio") return false;
  if (String(acc.code).startsWith("5")) return true;
  if (String(acc.code).startsWith("4")) return false;
  return true;
}

function leavesOf(accounts) {
  const parents = new Set(accounts.map((a) => a.parentId).filter(Boolean));
  return accounts
    .filter((a) => !parents.has(a.id))
    .sort((a, b) => String(a.code).localeCompare(String(b.code), "es", { numeric: true }));
}

function computeSaldos(accounts, opening, entries) {
  const from = opening.date || "0000-00-00";
  const ini = new Map();
  for (const line of opening.lines || []) {
    ini.set(line.accountId, { debit: Number(line.debit || 0), credit: Number(line.credit || 0) });
  }
  const mov = new Map();
  for (const entry of entries) {
    if (opening.date && String(entry.date) < from) continue;
    for (const line of entry.lines || []) {
      const cur = mov.get(line.accountId) || { debit: 0, credit: 0 };
      cur.debit += Number(line.debit || 0);
      cur.credit += Number(line.credit || 0);
      mov.set(line.accountId, cur);
    }
  }
  const rows = accounts
    .slice()
    .sort((a, b) => String(a.code).localeCompare(String(b.code), "es", { numeric: true }))
    .map((acc) => {
      const a = ini.get(acc.id) || { debit: 0, credit: 0 };
      const b = mov.get(acc.id) || { debit: 0, credit: 0 };
      const net = a.debit + b.debit - a.credit - b.credit;
      const normalDebit = debitNormal(acc);
      const signed = normalDebit ? net : -net;
      return {
        id: acc.id, code: acc.code, name: acc.name, nature: acc.nature,
        inicialDebe: a.debit, inicialHaber: a.credit,
        movDebe: b.debit, movHaber: b.credit,
        saldo: Math.abs(signed),
        saldoLado: signed >= 0 ? (normalDebit ? "debe" : "haber") : normalDebit ? "haber" : "debe",
      };
    });
  return { date: opening.date || "", leaves: leavesOf(accounts), rows };
}

function cleanOpening(data, accounts) {
  const date = String(data.date || "").slice(0, 10);
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
  if (!date) return { error: "datos" };
  return { date, lines };
}

module.exports = { getOpening, saveOpening, computeSaldos, emptyOpening, cleanOpening };
