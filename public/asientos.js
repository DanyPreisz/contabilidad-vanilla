const form = document.querySelector("#form");
const rowsEl = document.querySelector("#rows");
const listEl = document.querySelector("#list");
const totales = document.querySelector("#totales");
const msg = document.querySelector("#msg");
const storeEl = document.querySelector("#store");
const dateEl = document.querySelector("#date");
const conceptEl = document.querySelector("#concept");

let accounts = [];
let entries = [];
let lines = [{ accountId: "", debit: "", credit: "" }, { accountId: "", debit: "", credit: "" }];

dateEl.value = new Date().toISOString().slice(0, 10);
document.querySelector("#add").addEventListener("click", () => {
  lines.push({ accountId: "", debit: "", credit: "" });
  paintLines();
});
form.addEventListener("submit", save);
rowsEl.addEventListener("input", onLine);
rowsEl.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-del]");
  if (!btn || lines.length <= 2) return;
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

function accountLabel(id) {
  const a = accounts.find((x) => x.id === id);
  return a ? `${a.code} ${a.name}` : id;
}

function options(selected) {
  return `<option value="">Elegir cuenta</option>` + accounts
    .map((a) => `<option value="${a.id}" ${a.id === selected ? "selected" : ""}>${escapeHtml(a.code)} ${escapeHtml(a.name)}</option>`)
    .join("");
}

function paintLines() {
  rowsEl.innerHTML = lines
    .map(
      (line, i) => `<tr>
        <td><select data-i="${i}" data-f="accountId">${options(line.accountId)}</select></td>
        <td><input data-i="${i}" data-f="debit" type="number" min="0" step="0.01" value="${line.debit}" /></td>
        <td><input data-i="${i}" data-f="credit" type="number" min="0" step="0.01" value="${line.credit}" /></td>
        <td><button type="button" class="ghost" data-del="${i}">×</button></td>
      </tr>`
    )
    .join("");
  const d = lines.reduce((s, l) => s + cents(l.debit), 0);
  const h = lines.reduce((s, l) => s + cents(l.credit), 0);
  const ok = d > 0 && d === h;
  totales.className = "totales " + (ok ? "ok" : "bad");
  totales.textContent = `Debe ${money(d / 100)} · Haber ${money(h / 100)} · Dif. ${money((d - h) / 100)}`;
}

function onLine(event) {
  const el = event.target.closest("[data-i]");
  if (!el) return;
  const i = Number(el.dataset.i);
  const f = el.dataset.f;
  lines[i][f] = el.value;
  if (f === "debit" && Number(el.value) > 0) lines[i].credit = "";
  if (f === "credit" && Number(el.value) > 0) lines[i].debit = "";
  paintLines();
}

function paintList() {
  if (!entries.length) {
    listEl.innerHTML = "<p class='muted'>Todavía no hay asientos.</p>";
    return;
  }
  listEl.innerHTML = entries
    .map((e) => {
      const d = e.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
      const body = e.lines
        .map((l) => `<tr><td>${escapeHtml(accountLabel(l.accountId))}</td><td>${l.debit ? money(l.debit) : ""}</td><td>${l.credit ? money(l.credit) : ""}</td></tr>`)
        .join("");
      return `<article class="entry">
        <header>
          <strong>${escapeHtml(e.number || "")} · ${escapeHtml(e.date)}</strong>
          <button type="button" class="danger" data-entry="${e.id}">Borrar</button>
        </header>
        <p class="muted">${escapeHtml(e.concept)}</p>
        <table class="lines"><tbody>${body}</tbody></table>
        <p class="muted">Total ${money(d)}</p>
      </article>`;
    })
    .join("");
}

listEl.addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-entry]");
  if (!btn) return;
  await fetch("/api/entries/" + btn.dataset.entry, { method: "DELETE" });
  await load();
});

async function save(event) {
  event.preventDefault();
  msg.hidden = true;
  const payload = {
    date: dateEl.value,
    concept: conceptEl.value.trim(),
    lines: lines.map((l) => ({
      accountId: l.accountId,
      debit: Number(l.debit || 0),
      credit: Number(l.credit || 0),
    })),
  };
  const res = await fetch("/api/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    msg.hidden = false;
    msg.textContent =
      data.error === "balance" ? "El debe y el haber tienen que ser iguales y mayores a cero."
      : data.error === "cuenta" ? "Falta elegir una cuenta del plan."
      : data.error === "renglones" ? "Hace falta al menos un debe y un haber."
      : "No se pudo guardar el asiento.";
    return;
  }
  lines = [{ accountId: "", debit: "", credit: "" }, { accountId: "", debit: "", credit: "" }];
  conceptEl.value = "";
  await load();
}

async function load() {
  const health = await (await fetch("/health")).json();
  storeEl.textContent = health.store === "mongodb" ? "MongoDB" : "Local";
  accounts = await (await fetch("/api/accounts")).json();
  entries = await (await fetch("/api/entries")).json();
  paintLines();
  paintList();
}

load();
