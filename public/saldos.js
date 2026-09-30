const form = document.querySelector("#form");
const rowsEl = document.querySelector("#rows");
const currentEl = document.querySelector("#current");
const totales = document.querySelector("#totales");
const msg = document.querySelector("#msg");
const storeEl = document.querySelector("#store");
const dateEl = document.querySelector("#date");
const asOf = document.querySelector("#as-of");
const accountEl = document.querySelector("#account");
const debitEl = document.querySelector("#debit");
const creditEl = document.querySelector("#credit");

let accounts = [];
let leaves = [];
let lines = [];

dateEl.value = new Date().toISOString().slice(0, 10);
form.addEventListener("submit", save);
document.querySelector("#add").addEventListener("click", addLine);
debitEl.addEventListener("input", () => { if (Number(debitEl.value) > 0) creditEl.value = ""; });
creditEl.addEventListener("input", () => { if (Number(creditEl.value) > 0) debitEl.value = ""; });
rowsEl.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-del]");
  if (!btn) return;
  lines.splice(Number(btn.dataset.del), 1);
  paintLines();
});

function escapeHtml(s) {
  return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;");
}
function money(n) {
  return Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function cents(n) {
  return Math.round(Number(n || 0) * 100);
}
function byId(id) {
  return accounts.find((a) => a.id === id);
}
function label(acc) {
  return acc ? `${acc.code} ${acc.name}` : "";
}
function leavesOf(rows) {
  const parents = new Set(rows.map((a) => a.parentId).filter(Boolean));
  return rows.filter((a) => !parents.has(a.id)).sort((a, b) => String(a.code).localeCompare(String(b.code), "es", { numeric: true }));
}
function paintSelect() {
  accountEl.innerHTML = `<option value="">Elegir subcuenta</option>` + leaves.map((a) => `<option value="${a.id}">${escapeHtml(label(a))}</option>`).join("");
}
function paintLines() {
  rowsEl.innerHTML = lines.length
    ? lines.map((line, i) => `<tr><td>${escapeHtml(label(byId(line.accountId)) || line.accountId)}</td><td>${line.debit ? money(line.debit) : ""}</td><td>${line.credit ? money(line.credit) : ""}</td><td><button type="button" class="ghost" data-del="${i}">×</button></td></tr>`).join("")
    : "<tr><td colspan='4' class='muted'>Todavía no cargaste subcuentas.</td></tr>";
  const d = lines.reduce((s, l) => s + cents(l.debit), 0);
  const h = lines.reduce((s, l) => s + cents(l.credit), 0);
  totales.className = "totales";
  totales.textContent = `Debe ${money(d / 100)} · Haber ${money(h / 100)}`;
}
function addLine() {
  msg.hidden = true;
  const accountId = accountEl.value;
  const debit = Number(debitEl.value || 0);
  const credit = Number(creditEl.value || 0);
  if (!accountId) return show("Elegí una subcuenta.");
  if ((debit > 0 && credit > 0) || (debit <= 0 && credit <= 0)) return show("Cargá debe o haber, no los dos.");
  const i = lines.findIndex((l) => l.accountId === accountId);
  const next = { accountId, debit: debit || 0, credit: credit || 0 };
  if (i >= 0) lines[i] = next; else lines.push(next);
  accountEl.value = ""; debitEl.value = ""; creditEl.value = "";
  paintLines();
  accountEl.focus();
}
function show(text) { msg.hidden = false; msg.textContent = text; }
function debitNormal(acc) {
  if (!acc) return true;
  if (acc.nature === "activo") return true;
  if (acc.nature === "pasivo" || acc.nature === "patrimonio") return false;
  if (String(acc.code).startsWith("5")) return true;
  if (String(acc.code).startsWith("4")) return false;
  return true;
}
function computeLocal(opening, entries) {
  const from = opening.date || "0000-00-00";
  const ini = new Map();
  for (const line of opening.lines || []) ini.set(line.accountId, { debit: Number(line.debit || 0), credit: Number(line.credit || 0) });
  const mov = new Map();
  for (const entry of entries || []) {
    if (opening.date && String(entry.date) < from) continue;
    for (const line of entry.lines || []) {
      const cur = mov.get(line.accountId) || { debit: 0, credit: 0 };
      cur.debit += Number(line.debit || 0);
      cur.credit += Number(line.credit || 0);
      mov.set(line.accountId, cur);
    }
  }
  return accounts.map((acc) => {
    const a = ini.get(acc.id) || { debit: 0, credit: 0 };
    const b = mov.get(acc.id) || { debit: 0, credit: 0 };
    const net = a.debit + b.debit - a.credit - b.credit;
    const normal = debitNormal(acc);
    const signed = normal ? net : -net;
    return { id: acc.id, code: acc.code, name: acc.name, inicialDebe: a.debit, inicialHaber: a.credit, movDebe: b.debit, movHaber: b.credit, saldo: Math.abs(signed), saldoLado: signed >= 0 ? (normal ? "debe" : "haber") : normal ? "haber" : "debe" };
  });
}
function paintCurrent(rows, date) {
  asOf.textContent = date ? `Incluye asientos desde el ${date}` : "Todavía no hay fecha de saldos iniciales.";
  const visible = (rows || []).filter((r) => r.inicialDebe || r.inicialHaber || r.movDebe || r.movHaber || r.saldo);
  currentEl.innerHTML = visible.length
    ? visible.map((r) => `<tr><td><span class="code">${escapeHtml(r.code)}</span>${escapeHtml(r.name)}</td><td>${r.inicialDebe ? "D " + money(r.inicialDebe) : r.inicialHaber ? "H " + money(r.inicialHaber) : "—"}</td><td>D ${money(r.movDebe)} / H ${money(r.movHaber)}</td><td>${r.saldoLado === "haber" ? "H" : "D"} ${money(r.saldo)}</td></tr>`).join("")
    : "<tr><td colspan='4' class='muted'>Sin movimientos ni saldos.</td></tr>";
}
async function save(event) {
  event.preventDefault();
  msg.hidden = true;
  const res = await fetch("/api/opening", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: dateEl.value, lines }),
  });
  if (!res.ok) return show("No se pudo guardar.");
  await load();
}
async function jsonOr(url, fallback) {
  try {
    const res = await fetch(url);
    if (!res.ok) return fallback;
    return await res.json();
  } catch { return fallback; }
}
async function load() {
  const health = await jsonOr("/health", {});
  storeEl.textContent = health.store === "mongodb" ? "MongoDB" : "Local";
  accounts = await jsonOr("/api/accounts", []);
  leaves = leavesOf(accounts);
  paintSelect();
  const opening = await jsonOr("/api/opening", { date: dateEl.value, lines: [] });
  if (opening.date) dateEl.value = opening.date;
  lines = (opening.lines || []).map((l) => ({ accountId: l.accountId, debit: Number(l.debit || 0), credit: Number(l.credit || 0) }));
  paintLines();
  const saldos = await jsonOr("/api/saldos", null);
  const entries = await jsonOr("/api/entries", []);
  paintCurrent(saldos && saldos.rows ? saldos.rows : computeLocal(opening, entries), opening.date);
}
load();
