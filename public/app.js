const treeEl = document.querySelector("#tree");
const form = document.querySelector("#form");
const formTitle = document.querySelector("#form-title");
const parentLabel = document.querySelector("#parent-label");
const codeEl = document.querySelector("#code");
const nameEl = document.querySelector("#name");
const natureEl = document.querySelector("#nature");
const representaEl = document.querySelector("#representa");
const seDebitaEl = document.querySelector("#seDebita");
const seAcreditaEl = document.querySelector("#seAcredita");
const deleteBtn = document.querySelector("#delete");
const msg = document.querySelector("#msg");
const q = document.querySelector("#q");
const storeEl = document.querySelector("#store");
const saveBtn = document.querySelector("#save");

let accounts = [];
let mode = "idle";
let parentId = null;
let editingId = null;

document.querySelector("#cancel").addEventListener("click", idle);
q.addEventListener("input", paint);
form.addEventListener("submit", save);
deleteBtn.addEventListener("click", removeAcc);
natureEl.addEventListener("change", () => { if (mode === "create") fillManual(natureEl.value, null); });

treeEl.addEventListener("click", (event) => {
  const add = event.target.closest("[data-add]");
  if (add) { event.stopPropagation(); startCreate(add.dataset.add); return; }
  const row = event.target.closest("[data-id]");
  if (row) startEdit(row.dataset.id);
});

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&" + "amp;").replace(/</g, "<" + "lt;");
}
function childrenOf(id) {
  return accounts.filter((a) => a.parentId === id).sort((a, b) => String(a.code).localeCompare(String(b.code), "es", { numeric: true }));
}
function matches(acc, query) {
  if (!query) return true;
  if (`${acc.code} ${acc.name}`.toLowerCase().includes(query)) return true;
  return childrenOf(acc.id).some((c) => matches(c, query));
}
function renderNode(acc, query) {
  const kids = childrenOf(acc.id).filter((c) => matches(c, query));
  const on = editingId === acc.id || parentId === acc.id ? "on" : "";
  return `<li class="node"><div class="row ${on}" data-id="${acc.id}"><span></span><span><span class="code">${escapeHtml(acc.code)}</span>${escapeHtml(acc.name)}</span><button type="button" class="add" data-add="${acc.id}">+ subcuenta</button></div>${kids.length ? `<ul class="kids">${kids.map((c) => renderNode(c, query)).join("")}</ul>` : ""}</li>`;
}
function paint() {
  const query = q.value.trim().toLowerCase();
  treeEl.innerHTML = childrenOf(null).filter((a) => matches(a, query)).map((a) => renderNode(a, query)).join("") || "<li class='muted'>Sin cuentas</li>";
}
function clearManual() {
  representaEl.value = ""; seDebitaEl.value = ""; seAcreditaEl.value = "";
}
function defaultsByNature(nature) {
  if (nature === "pasivo") return { representa: "Obligación a pagar. Saldo acreedor.", seDebita: "Se cancela, reduce o paga la deuda.", seAcredita: "Nace o aumenta la deuda." };
  if (nature === "patrimonio") return { representa: "Participación de los dueños. Saldo acreedor.", seDebita: "Disminuciones de capital, reservas o resultados.", seAcredita: "Aportes, reservas o resultados positivos." };
  if (nature === "resultado") return { representa: "Resultado del ejercicio (ingreso o gasto).", seDebita: "Gastos, costos o descuentos concedidos.", seAcredita: "Ingresos, ventas o descuentos obtenidos." };
  return { representa: "Bien o derecho. Saldo deudor.", seDebita: "Aumenta el activo (compra, cobro, depósito).", seAcredita: "Disminuye el activo (pago, venta, extracción)." };
}
function fillManual(nature, acc) {
  if (acc && (acc.representa || acc.seDebita || acc.seAcredita)) {
    representaEl.value = acc.representa || ""; seDebitaEl.value = acc.seDebita || ""; seAcreditaEl.value = acc.seAcredita || ""; return;
  }
  if (mode === "edit") {
    representaEl.value = acc.representa || ""; seDebitaEl.value = acc.seDebita || ""; seAcreditaEl.value = acc.seAcredita || ""; return;
  }
  const d = defaultsByNature(nature);
  representaEl.value = d.representa; seDebitaEl.value = d.seDebita; seAcreditaEl.value = d.seAcredita;
}
function idle() {
  mode = "idle"; parentId = null; editingId = null;
  formTitle.textContent = "Nueva subcuenta";
  parentLabel.textContent = "Elegí una cuenta y tocá + subcuenta";
  codeEl.value = ""; nameEl.value = ""; natureEl.value = "activo"; clearManual();
  deleteBtn.hidden = true; saveBtn.disabled = true; msg.hidden = true; paint();
}
function startCreate(pid) {
  const parent = accounts.find((a) => a.id === pid);
  if (!parent) return idle();
  mode = "create"; parentId = pid; editingId = null;
  formTitle.textContent = "Nueva subcuenta";
  parentLabel.textContent = `Dentro de ${parent.code} ${parent.name}`;
  codeEl.value = suggestCode(pid); nameEl.value = ""; natureEl.value = parent.nature;
  fillManual(parent.nature, null);
  deleteBtn.hidden = true; saveBtn.disabled = false; msg.hidden = true; paint(); nameEl.focus();
}
function startEdit(id) {
  const acc = accounts.find((a) => a.id === id);
  if (!acc) return;
  mode = "edit"; editingId = id; parentId = acc.parentId;
  formTitle.textContent = acc.parentId ? "Editar subcuenta" : "Capítulo / rubro";
  parentLabel.textContent = acc.parentId ? `Hija de ${accounts.find((a) => a.id === acc.parentId)?.name || ""}` : "Estructura FACPCE";
  codeEl.value = acc.code; nameEl.value = acc.name; natureEl.value = acc.nature;
  fillManual(acc.nature, acc);
  deleteBtn.hidden = Boolean(childrenOf(id).length); saveBtn.disabled = false; msg.hidden = true; paint();
}
function suggestCode(pid) {
  const parent = accounts.find((a) => a.id === pid);
  const base = parent?.code || "";
  const siblings = childrenOf(pid);
  let max = 0; let width = 2;
  for (const s of siblings) {
    const rest = base && String(s.code).startsWith(base + ".") ? String(s.code).slice(base.length + 1) : String(s.code);
    const first = rest.split(".")[0];
    const n = parseInt(first, 10);
    if (!Number.isNaN(n) && n > max) max = n;
    if (first && /^\d+$/.test(first) && first.length > width) width = first.length;
  }
  return `${base}.${String(max + 1).padStart(width, "0")}`;
}
async function save(event) {
  event.preventDefault();
  if (mode === "idle") return;
  if (mode === "create" && !parentId) return show("Elegí una cuenta padre.");
  const payload = {
    code: codeEl.value.trim(), name: nameEl.value.trim(), nature: natureEl.value,
    representa: representaEl.value.trim(), seDebita: seDebitaEl.value.trim(), seAcredita: seAcreditaEl.value.trim(),
    parentId: mode === "create" ? parentId : accounts.find((a) => a.id === editingId)?.parentId,
  };
  const res = await fetch(mode === "edit" ? "/api/accounts/" + editingId : "/api/accounts", {
    method: mode === "edit" ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) return show("No se pudo guardar.");
  const stay = mode === "create" ? parentId : data.parentId;
  await load();
  if (stay) startCreate(stay); else idle();
}
async function removeAcc() {
  if (!editingId) return;
  const res = await fetch("/api/accounts/" + editingId, { method: "DELETE" });
  if (!res.ok) return show("Borrá primero las subcuentas.");
  await load(); idle();
}
function show(text) { msg.hidden = false; msg.textContent = text; }
async function load() {
  const health = await (await fetch("/health")).json();
  storeEl.textContent = health.store === "mongodb" ? "MongoDB" : "Local";
  accounts = await (await fetch("/api/accounts")).json();
  accounts.sort((a, b) => String(a.code).localeCompare(String(b.code), "es", { numeric: true }));
  paint();
}
load().then(() => {
  const edit = new URLSearchParams(location.search).get("edit");
  if (edit) startEdit(edit); else idle();
});
