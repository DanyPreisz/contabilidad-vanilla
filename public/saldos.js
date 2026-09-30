const form = document.querySelector("#form");
const rowsEl = document.querySelector("#rows");
const currentEl = document.querySelector("#current");
const totales = document.querySelector("#totales");
const msg = document.querySelector("#msg");
const storeEl = document.querySelector("#store");
const dateEl = document.querySelector("#date");
const asOf = document.querySelector("#as-of");

let leaves = [];
let lines = {};

dateEl.value = new Date().toISOString().slice(0, 10);
dateEl.addEventListener("change", paintForm);
form.addEventListener("submit", save);
rowsEl.addEventListener("input", onLine);

function escapeHtml(s) {
  return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;");
}

function money(n) {
  return Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cents(n) {
  return Math.round(Number(n || 0) * 100);
}

function paintForm() {
  rowsEl.innerHTML = leaves
    .map((a) => {
      const line = lines[a.id] || { debit: "", credit: "" };
      return `<tr>
        <td><span class="code">${escapeHtml(a.code)}</span>${escapeHtml(a.name)}</td>
        <td><input data-id="${a.id}" data-f="debit" type="number" min="0" step="0.01" value="${line.debit || ""}" /></td>
        <td><input data-id="${a.id}" data-f="credit" type="number" min="0" step="0.01" value="${line.credit || ""}" /></td>
      </tr>`;
    })
    .join("");
  const d = Object.values(lines).reduce((s, l) => s + cents(l.debit), 0);
  const h = Object.values(lines).reduce((s, l) => s + cents(l.credit), 0);
  const ok = d === h;
  totales.className = "totales " + (ok ? "ok" : "bad");
  totales.textContent = `Debe ${money(d / 100)} · Haber ${money(h / 100)} · Dif. ${money((d - h) / 100)}`;
}

function onLine(event) {
  const el = event.target.closest("[data-id]");
  if (!el) return;
  const id = el.dataset.id;
  lines[id] = lines[id] || { debit: "", credit: "" };
  lines[id][el.dataset.f] = el.value;
  if (el.dataset.f === "debit" && Number(el.value) > 0) lines[id].credit = "";
  if (el.dataset.f === "credit" && Number(el.value) > 0) lines[id].debit = "";
  paintForm();
}

function paintCurrent(rows, date) {
  asOf.textContent = date ? `Incluye asientos desde el ${date}` : "Todavía no hay fecha de saldos iniciales.";
  const visible = rows.filter((r) => r.inicialDebe || r.inicialHaber || r.movDebe || r.movHaber || r.saldo);
  if (!visible.length) {
    currentEl.innerHTML = "<tr><td colspan='4' class='muted'>Sin movimientos ni saldos.</td></tr>";
    return;
  }
  currentEl.innerHTML = visible
    .map((r) => {
      const ini = r.inicialDebe ? `D ${money(r.inicialDebe)}` : r.inicialHaber ? `H ${money(r.inicialHaber)}` : "—";
      const mov = `D ${money(r.movDebe)} / H ${money(r.movHaber)}`;
      const side = r.saldoLado === "haber" ? "H" : "D";
      return `<tr>
        <td><span class="code">${escapeHtml(r.code)}</span>${escapeHtml(r.name)}</td>
        <td>${ini}</td>
        <td>${mov}</td>
        <td>${side} ${money(r.saldo)}</td>
      </tr>`;
    })
    .join("");
}

async function save(event) {
  event.preventDefault();
  msg.hidden = true;
  const payload = {
    date: dateEl.value,
    lines: leaves.map((a) => ({
      accountId: a.id,
      debit: Number((lines[a.id] || {}).debit || 0),
      credit: Number((lines[a.id] || {}).credit || 0),
    })).filter((l) => l.debit || l.credit),
  };
  const res = await fetch("/api/opening", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    msg.hidden = false;
    msg.textContent = data.error === "balance" ? "El debe y el haber iniciales tienen que ser iguales." : "No se pudo guardar.";
    return;
  }
  await load();
}

async function load() {
  const health = await (await fetch("/health")).json();
  storeEl.textContent = health.store === "mongodb" ? "MongoDB" : "Local";
  const opening = await (await fetch("/api/opening")).json();
  const saldos = await (await fetch("/api/saldos")).json();
  leaves = saldos.leaves || [];
  if (opening.date) dateEl.value = opening.date;
  lines = {};
  for (const line of opening.lines || []) {
    lines[line.accountId] = {
      debit: line.debit ? String(line.debit) : "",
      credit: line.credit ? String(line.credit) : "",
    };
  }
  paintForm();
  paintCurrent(saldos.rows || [], opening.date);
}

load();
