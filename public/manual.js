const listEl = document.querySelector("#list");
const storeEl = document.querySelector("#store");
const q = document.querySelector("#q");
let accounts = [];
q.addEventListener("input", paint);
function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&" + "amp;").replace(/</g, "<" + "lt;");
}
function leavesOf(rows) {
  const parents = new Set(rows.map((a) => a.parentId).filter(Boolean));
  return rows.filter((a) => !parents.has(a.id)).sort((a, b) => String(a.code).localeCompare(String(b.code), "es", { numeric: true }));
}
function paint() {
  const query = q.value.trim().toLowerCase();
  const rows = leavesOf(accounts).filter((a) => `${a.code} ${a.name}`.toLowerCase().includes(query));
  if (!rows.length) {
    listEl.innerHTML = "<p class='muted'>No hay subcuentas para mostrar.</p>";
    return;
  }
  listEl.innerHTML = rows.map((a) => {
    const representa = a.representa || "Sin dato. Editala en el plan de cuentas.";
    const debe = a.seDebita || "Sin dato.";
    const haber = a.seAcredita || "Sin dato.";
    return `<article class="manual-card">
      <h3><span class="code">${escapeHtml(a.code)}</span> ${escapeHtml(a.name)}</h3>
      <p><span class="lab">Naturaleza</span> ${escapeHtml(a.nature)}</p>
      <p><span class="lab">El saldo representa</span><br>${escapeHtml(representa)}</p>
      <p><span class="lab">Se debita cuando</span><br>${escapeHtml(debe)}</p>
      <p><span class="lab">Se acredita cuando</span><br>${escapeHtml(haber)}</p>
      <p><a href="/?edit=${encodeURIComponent(a.id)}">Editar en el plan</a></p>
    </article>`;
  }).join("");
}
async function load() {
  const health = await (await fetch("/health")).json();
  storeEl.textContent = health.store === "mongodb" ? "MongoDB" : "Local";
  accounts = await (await fetch("/api/accounts")).json();
  paint();
}
load();
