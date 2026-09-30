const storeEl = document.querySelector("#store");
const asOf = document.querySelector("#as-of");
const eqEl = document.querySelector("#eq");
const bodyEl = document.querySelector("#body");

const RUBROS = [
  { cap: "ACTIVO" },
  { rubro: "Activo corriente", code: "1.1", side: "activo" },
  { sub: "Caja y bancos (disponibilidades)", code: "1.1.01", side: "activo" },
  { sub: "Inversiones temporarias", code: "1.1.02", side: "activo" },
  { sub: "Créditos por ventas", code: "1.1.03", side: "activo" },
  { sub: "Otros créditos", code: "1.1.04", side: "activo" },
  { sub: "Bienes de cambio", code: "1.1.05", side: "activo" },
  { tot: "Total activo corriente", code: "1.1", side: "activo" },
  { rubro: "Activo no corriente", code: "1.2", side: "activo" },
  { sub: "Créditos no corrientes", code: "1.2.01", side: "activo" },
  { sub: "Inversiones permanentes", code: "1.2.02", side: "activo" },
  { sub: "Bienes de uso", code: "1.2.03", side: "activo" },
  { sub: "Activos intangibles", code: "1.2.04", side: "activo" },
  { tot: "Total activo no corriente", code: "1.2", side: "activo" },
  { grand: "TOTAL ACTIVO", code: "1", side: "activo" },
  { cap: "PASIVO" },
  { rubro: "Pasivo corriente", code: "2.1", side: "pasivo" },
  { sub: "Deudas comerciales", code: "2.1.01", side: "pasivo" },
  { sub: "Deudas bancarias y financieras", code: "2.1.02", side: "pasivo" },
  { sub: "Deudas fiscales y sociales", code: "2.1.03", side: "pasivo" },
  { sub: "Otras deudas y provisiones", code: "2.1.04", side: "pasivo" },
  { tot: "Total pasivo corriente", code: "2.1", side: "pasivo" },
  { rubro: "Pasivo no corriente", code: "2.2", side: "pasivo" },
  { sub: "Deudas financieras largo plazo", code: "2.2.01", side: "pasivo" },
  { sub: "Previsiones", code: "2.2.02", side: "pasivo" },
  { tot: "Total pasivo no corriente", code: "2.2", side: "pasivo" },
  { grand: "TOTAL PASIVO", code: "2", side: "pasivo" },
  { cap: "PATRIMONIO NETO" },
  { sub: "Capital social / aportes", code: "3.1", side: "patrimonio" },
  { sub: "Aportes irrevocables", code: "3.2", side: "patrimonio" },
  { sub: "Ganancias reservadas", code: "3.3", side: "patrimonio" },
  { sub: "Resultados acumulados", code: "3.4", side: "patrimonio" },
  { sub: "Resultado del ejercicio", code: "R", side: "resultado" },
  { grand: "TOTAL PATRIMONIO NETO", code: "PN", side: "patrimonio" }
];

function money(n) {
  return Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&" + "amp;").replace(/</g, "<" + "lt;");
}
function netDebit(row) {
  return Number(row.inicialDebe || 0) + Number(row.movDebe || 0) - Number(row.inicialHaber || 0) - Number(row.movHaber || 0);
}
function displayAmt(net, side) {
  return side === "activo" ? net : -net;
}
function matchPrefix(code, prefix) {
  return code === prefix || String(code).startsWith(prefix + ".");
}
function sumPrefix(rows, prefix, side) {
  return rows.filter((r) => matchPrefix(r.code, prefix)).reduce((s, r) => s + displayAmt(netDebit(r), side), 0);
}
function leavesUnder(rows, prefix) {
  return rows.filter((r) => String(r.code).startsWith(prefix + ".") && netDebit(r))
    .sort((a, b) => String(a.code).localeCompare(String(b.code), "es", { numeric: true }));
}
function resultado(rows) {
  const ing = rows.filter((r) => String(r.code).startsWith("4")).reduce((s, r) => s - netDebit(r), 0);
  const egr = rows.filter((r) => String(r.code).startsWith("5")).reduce((s, r) => s + netDebit(r), 0);
  return ing - egr;
}
function resultadoLeaves(rows) {
  return rows.filter((r) => (String(r.code).startsWith("4") || String(r.code).startsWith("5")) && netDebit(r))
    .sort((a, b) => String(a.code).localeCompare(String(b.code), "es", { numeric: true }));
}
function paint(rows, date) {
  asOf.textContent = date ? "Saldos al " + date + " (incluye asientos desde esa fecha)" : "Sin fecha de saldos iniciales: solo movimientos de asientos.";
  const html = [];
  for (const line of RUBROS) {
    if (line.cap) { html.push(`<tr><td class="cap" colspan="2">${escapeHtml(line.cap)}</td></tr>`); continue; }
    if (line.rubro) {
      html.push(`<tr class="rubro"><td>${escapeHtml(line.rubro)}</td><td class="amt">${money(sumPrefix(rows, line.code, line.side))}</td></tr>`);
      continue;
    }
    if (line.sub) {
      const amt = line.code === "R" ? resultado(rows) : sumPrefix(rows, line.code, line.side);
      html.push(`<tr><td class="sub">${escapeHtml(line.sub)}</td><td class="amt">${money(amt)}</td></tr>`);
      const kids = line.code === "R" ? resultadoLeaves(rows) : leavesUnder(rows, line.code);
      for (const k of kids) {
        const shown = line.code === "R" ? (k.code.startsWith("4") ? -netDebit(k) : netDebit(k)) : displayAmt(netDebit(k), line.side);
        html.push(`<tr><td class="leaf">${escapeHtml(k.code)} ${escapeHtml(k.name)}</td><td class="amt">${money(shown)}</td></tr>`);
      }
      continue;
    }
    if (line.tot || line.grand) {
      const amt = line.code === "PN" ? sumPrefix(rows, "3", "patrimonio") + resultado(rows) : sumPrefix(rows, line.code, line.side);
      html.push(`<tr class="${line.grand ? "grand" : "tot"}"><td>${escapeHtml(line.tot || line.grand)}</td><td class="amt">${money(amt)}</td></tr>`);
    }
  }
  const activo = sumPrefix(rows, "1", "activo");
  const pasivoPn = sumPrefix(rows, "2", "pasivo") + sumPrefix(rows, "3", "patrimonio") + resultado(rows);
  html.push(`<tr class="grand"><td>TOTAL PASIVO + PATRIMONIO NETO</td><td class="amt">${money(pasivoPn)}</td></tr>`);
  bodyEl.innerHTML = html.join("");
  const ok = Math.round(activo * 100) === Math.round(pasivoPn * 100);
  eqEl.className = "eq " + (ok ? "ok" : "bad");
  eqEl.textContent = ok ? "El activo iguala pasivo + patrimonio neto." : "Diferencia " + money(activo - pasivoPn) + " (activo " + money(activo) + ").";
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
  const saldos = await jsonOr("/api/saldos", null);
  if (saldos && saldos.rows) { paint(saldos.rows, saldos.date); return; }
  const accounts = await jsonOr("/api/accounts", []);
  const opening = await jsonOr("/api/opening", { date: "", lines: [] });
  const entries = await jsonOr("/api/entries", []);
  const ini = new Map();
  for (const line of opening.lines || []) ini.set(line.accountId, { debit: Number(line.debit || 0), credit: Number(line.credit || 0) });
  const mov = new Map();
  for (const entry of entries) {
    if (opening.date && String(entry.date) < opening.date) continue;
    for (const line of entry.lines || []) {
      const cur = mov.get(line.accountId) || { debit: 0, credit: 0 };
      cur.debit += Number(line.debit || 0);
      cur.credit += Number(line.credit || 0);
      mov.set(line.accountId, cur);
    }
  }
  paint(accounts.map((acc) => {
    const a = ini.get(acc.id) || { debit: 0, credit: 0 };
    const b = mov.get(acc.id) || { debit: 0, credit: 0 };
    return { id: acc.id, code: acc.code, name: acc.name, inicialDebe: a.debit, inicialHaber: a.credit, movDebe: b.debit, movHaber: b.credit };
  }), opening.date);
}
load();
