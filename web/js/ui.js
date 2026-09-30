// ============================================================================
// js/ui.js â€” Seluruh tampilan & interaksi.
// Berkomunikasi dengan data HANYA lewat `store` (js/store.js).
// ============================================================================

import { store } from "./store.js";
import {
  formatIDR, formatSignedIDR, formatDateID, formatDateLong,
  formatHistoryTime, monthLabel, toMonthKey, toISODate,
  shiftMonth, daysInMonth, esc,
} from "./format.js";
import { donutChart, barsChart, lineChart } from "./charts.js";
import { computeInsights } from "./insights.js";

// ---------------------------------------------------------------------------
// State aplikasi
// ---------------------------------------------------------------------------
const state = {
  view: "dashboard",          // "dashboard" | "transaksi" | "anggaran"
  month: toMonthKey(),        // "YYYY-MM"
  filters: { q: "", type: "semua", categoryId: "semua", from: "", to: "" },
  txs: [],
  cats: [],
  budgets: {},
  settings: { theme: "auto" },
  history: [],
};

const catsById = () => new Map(state.cats.map((c) => [c.id, c]));

// Cache data-URL foto agar tidak dibaca ulang dari IndexedDB tiap render.
const photoCache = new Map();

async function photoDataUrl(photoId) {
  if (!photoId) return null;
  if (photoCache.has(photoId)) return photoCache.get(photoId);
  const url = await store.getPhoto(photoId);
  photoCache.set(photoId, url);
  return url;
}

/** Isi <img data-photo-id> setelah render (non-blocking). */
function hydratePhotoThumbs(root = document) {
  root.querySelectorAll("img[data-photo-id]:not([data-done])").forEach(async (img) => {
    img.dataset.done = "1";
    const url = await photoDataUrl(img.getAttribute("data-photo-id"));
    const btn = img.closest(".tx-thumb-btn");
    if (url) {
      img.src = url;
      btn?.classList.add("has-photo");
    } else {
      btn?.remove(); // blob foto hilang â†’ sembunyikan
    }
  });
}

// ---------------------------------------------------------------------------
// Inisialisasi
// ---------------------------------------------------------------------------
export async function init() {
  await reloadData();
  applyTheme();
  wireEvents();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.settings.theme === "auto") applyTheme();
  });
  render();
}

async function reloadData() {
  const [txs, cats, budgets, settings] = await Promise.all([
    store.listTransactions(),
    store.listCategories(),
    store.getBudgets(),
    store.getSettings(),
  ]);
  state.txs     = txs;
  state.cats    = cats;
  state.budgets = budgets;
  state.settings = settings;
  await reloadHistory();
}

async function reloadHistory() {
  state.history = await store.listHistory(state.month);
}

function applyTheme() {
  const pref = state.settings.theme || "auto";
  const dark =
    pref === "dark" ||
    (pref === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const btn = document.getElementById("themeToggle");
  if (btn) btn.textContent = dark ? "â˜€ï¸" : "ðŸŒ™";
}

// ---------------------------------------------------------------------------
// Render utama
// ---------------------------------------------------------------------------
function render() {
  // Label bulan di sub-header
  const lbl = document.getElementById("monthLabel");
  if (lbl) lbl.textContent = monthLabel(state.month);

  // Highlight tab aktif
  document.querySelectorAll(".bottom-nav button[data-view]").forEach((b) => {
    const active = b.dataset.view === state.view;
    b.classList.toggle("active", active);
    b.setAttribute("aria-current", active ? "page" : "false");
  });

  const main = document.getElementById("view");
  if (!main) return;

  if (state.view === "dashboard")  main.innerHTML = viewDashboard();
  else if (state.view === "transaksi") main.innerHTML = viewTransactions();
  else main.innerHTML = viewBudgets();

  hydratePhotoThumbs(main);
}

// ===========================================================================
// LAYAR 1 â€” Dashboard
// ===========================================================================
function viewDashboard() {
  const mk       = state.month;
  const inMonth  = state.txs.filter((t) => (t.date || "").startsWith(mk));
  const incomeM  = inMonth.filter((t) => t.type === "pemasukan").reduce((s, t) => s + t.amount, 0);
  const expenseM = inMonth.filter((t) => t.type === "pengeluaran").reduce((s, t) => s + t.amount, 0);
  const netFlow  = incomeM - expenseM;
  const savRate  = incomeM > 0 ? Math.round(((incomeM - expenseM) / incomeM) * 100) : 0;

  // Saldo semua waktu
  const totalIncome  = state.txs.filter((t) => t.type === "pemasukan").reduce((s, t)  => s + t.amount, 0);
  const totalExpense = state.txs.filter((t) => t.type === "pengeluaran").reduce((s, t) => s + t.amount, 0);
  const saldoAll     = totalIncome - totalExpense;

  // Distribusi pengeluaran per kategori bulan ini
  const spentByCat = new Map();
  for (const t of inMonth) {
    if (t.type !== "pengeluaran") continue;
    spentByCat.set(t.categoryId, (spentByCat.get(t.categoryId) || 0) + t.amount);
  }
  const distribution = [...spentByCat.entries()]
    .map(([id, value]) => {
      const cat = catsById().get(id) || {};
      return {
        id, value,
        name:  cat.name  || "Lainnya",
        icon:  cat.icon  || "ðŸ“¦",
        color: cat.color || "#6b7280",
        pct:   expenseM ? Math.round((value / expenseM) * 100) : 0,
      };
    })
    .sort((a, b) => b.value - a.value);

  // Anggaran bulan ini
  const totalLimit = Object.values(state.budgets).reduce((s, n) => s + Number(n || 0), 0);
  const budgetPct  = totalLimit ? Math.min(100, Math.round((expenseM / totalLimit) * 100)) : 0;
  const budgetOver = totalLimit > 0 && expenseM > totalLimit;

  // Insights
  const insights = computeInsights(state.txs, mk, catsById());

  // 5 transaksi terbaru bulan ini
  const recent = inMonth.slice(0, 5);

  // Grafik 6 bulan
  const sixMonths = buildSixMonths(mk);

  // Grafik tren harian bulan ini
  const dailyPoints = buildDailyPoints(mk, inMonth);

  const hasAnyTx = state.txs.length > 0;

  return `
    ${cardHero(netFlow, incomeM, expenseM, savRate, saldoAll, mk, inMonth.length)}
    ${cardBudget(totalLimit, expenseM, budgetPct, budgetOver)}
    ${cardDistribution(distribution, expenseM)}
    ${inMonth.length === 0 ? infoRow() : ""}
    ${cardActivity(inMonth, recent)}
    ${hasAnyTx ? cardInsights(insights) : ""}
    ${hasAnyTx ? cardBarChart(sixMonths) : ""}
    ${hasAnyTx && dailyPoints.length > 0 ? cardLineChart(dailyPoints, mk) : ""}
    ${viewHistory()}
  `;
}

// --- Kartu Hero ---
function cardHero(net, inc, exp, savRate, saldoAll, mk, txCount) {
  const expProgress = inc > 0 ? Math.min(100, Math.round((exp / inc) * 100)) : 0;
  const subText = txCount > 0
    ? `${monthLabel(mk)} Â· Tingkat tabungan ${savRate}%`
    : "Belum ada transaksi";

  return `
    <section class="card-hero" aria-label="Arus Kas Bersih">
      <span class="kicker">Arus Kas Bersih</span>
      <div class="hero-amount ${net < 0 ? "neg" : ""}" data-amount>${formatIDR(net)}</div>
      <p class="hero-sub">${esc(subText)}</p>
      <div class="hero-divider"></div>
      <div class="hero-metrics">
        <div class="hero-metric">
          <div class="metric-label">
            <span class="metric-dot income" aria-hidden="true"></span>Pemasukan
          </div>
          <div class="metric-value" data-amount>${formatIDR(inc)}</div>
        </div>
        <div class="hero-metric">
          <div class="metric-label">
            <span class="metric-dot expense" aria-hidden="true"></span>Pengeluaran
          </div>
          <div class="metric-value" data-amount>${formatIDR(exp)}</div>
        </div>
      </div>
      <div class="hero-progress" role="progressbar" aria-valuenow="${expProgress}" aria-valuemin="0" aria-valuemax="100">
        <div class="hero-progress-fill" style="width:${expProgress}%"></div>
      </div>
      <p class="hero-saldo">Total saldo: <strong data-amount>${formatIDR(saldoAll)}</strong></p>
    </section>`;
}

// --- Kartu Anggaran ---
function cardBudget(totalLimit, expenseM, budgetPct, budgetOver) {
  let body;
  if (totalLimit > 0) {
    const fillClass = budgetOver ? "over" : budgetPct >= 70 ? "warn" : "";
    body = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:4px">
        <span data-amount style="font-size:15px;font-variant-numeric:tabular-nums;">
          ${formatIDR(expenseM)} <span style="color:var(--text-muted);font-weight:400">/ ${formatIDR(totalLimit)}</span>
        </span>
      </div>
      <div class="progress" role="progressbar" aria-valuenow="${budgetPct}" aria-valuemin="0" aria-valuemax="100">
        <div class="progress-fill ${fillClass}" style="width:${budgetPct}%"></div>
      </div>
      <p class="budget-status-text ${fillClass}">${budgetOver ? `âš ï¸ Melebihi batas sebesar ${formatIDR(expenseM - totalLimit)}` : budgetPct >= 70 ? `Hati-hati, sudah ${budgetPct}% dari batas` : `${budgetPct}% telah digunakan`}</p>`;
  } else {
    body = `
      <p style="font-size:14px;color:var(--text-muted);margin-bottom:12px;">
        Buat batas pengeluaran agar progres bulan ini mudah dipantau.
      </p>
      <button class="btn btn-ghost" style="width:100%" data-action="nav" data-view="anggaran">Atur sekarang</button>`;
  }

  return `
    <section class="card" aria-label="Anggaran Bulan Ini">
      <div class="card-head">
        <span class="kicker">Batas Bulan Ini</span>
        <button class="link-btn" data-action="nav" data-view="anggaran">${totalLimit ? "Ubah" : "Tetapkan"}</button>
      </div>
      <h2 class="card-title" style="margin-bottom:12px">Anggaran</h2>
      ${body}
    </section>`;
}

// --- Kartu Distribusi ---
function cardDistribution(distribution, expenseM) {
  let body;
  if (distribution.length > 0) {
    const donutData = distribution.map((d) => ({ label: d.name, value: d.value, color: d.color }));
    body = donutChart(donutData, 160);
  } else {
    body = `<p class="empty-inline">Belum ada pengeluaran untuk diringkas.</p>`;
  }

  return `
    <section class="card" aria-label="Distribusi Per Kategori">
      <div class="card-head">
        <span class="kicker">Distribusi</span>
        <span class="badge-pill" aria-label="${distribution.length} kategori">${distribution.length}</span>
      </div>
      <h2 class="card-title" style="margin-bottom:14px">Per kategori</h2>
      ${body}
    </section>`;
}

// --- Baris info state kosong ---
function infoRow() {
  return `
    <div class="info-row" role="note">
      <span class="info-row-icon" aria-hidden="true">i</span>
      <span>Catat transaksi untuk melihat pola keuanganmu bulan ini.</span>
    </div>`;
}

// --- Kartu Aktivitas ---
function cardActivity(inMonth, recent) {
  return `
    <section class="card" aria-label="Aktivitas Transaksi">
      <div class="card-head">
        <span class="kicker">Aktivitas</span>
        <span class="badge-pill" aria-label="${inMonth.length} transaksi">${inMonth.length}</span>
      </div>
      <h2 class="card-title" style="margin-bottom:14px">Transaksi</h2>
      ${recent.length > 0
        ? txListHTML(recent)
        : `<p class="empty-inline">Belum ada transaksi bulan ini.</p>`}
      ${inMonth.length > 5
        ? `<button class="btn btn-ghost" style="width:100%;margin-top:12px" data-action="nav" data-view="transaksi">Lihat semua transaksi</button>`
        : ""}
    </section>`;
}

// --- Kartu Wawasan ---
function cardInsights(insights) {
  if (!insights.length) return "";
  const items = insights.map((ins) => `
    <div class="insight-item ${esc(ins.tone)}" role="listitem">
      <span class="insight-icon" aria-hidden="true">${ins.icon}</span>
      <div class="insight-body">
        <div class="insight-title">${esc(ins.title)}</div>
        <div class="insight-text">${esc(ins.text)}</div>
      </div>
    </div>`).join("");

  return `
    <section class="card" aria-label="Wawasan Keuangan">
      <h2 class="card-title" style="margin-bottom:14px">ðŸ’¡ Wawasan</h2>
      <div class="insights" role="list">${items}</div>
    </section>`;
}

// --- Kartu Bar Chart 6 bulan ---
function cardBarChart(months) {
  return `
    <section class="card" aria-label="Grafik Arus Kas 6 Bulan">
      <h2 class="card-title" style="margin-bottom:14px">ðŸ“Š Arus Kas 6 Bulan Terakhir</h2>
      <div class="chart-wrap">${barsChart(months, 520, 200)}</div>
    </section>`;
}

// --- Kartu Line Chart harian ---
function cardLineChart(points, mk) {
  return `
    <section class="card" aria-label="Tren Pengeluaran Harian">
      <h2 class="card-title" style="margin-bottom:14px">ðŸ“ˆ Tren Pengeluaran Harian Â· ${esc(monthLabel(mk))}</h2>
      <div class="chart-wrap">${lineChart(points, 520, 180)}</div>
    </section>`;
}

// --- Helpers data grafik ---
function buildSixMonths(mk) {
  return Array.from({ length: 6 }, (_, i) => {
    const key   = shiftMonth(mk, i - 5);
    const [, m] = key.split("-").map(Number);
    const SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
    const txs   = state.txs.filter((t) => (t.date || "").startsWith(key));
    return {
      key,
      label:   SHORT[m - 1],
      income:  txs.filter((t) => t.type === "pemasukan").reduce((s, t)  => s + t.amount, 0),
      expense: txs.filter((t) => t.type === "pengeluaran").reduce((s, t) => s + t.amount, 0),
    };
  });
}

function buildDailyPoints(mk, inMonth) {
  const dim = daysInMonth(mk);
  const byDay = new Array(dim).fill(0);
  for (const t of inMonth) {
    if (t.type !== "pengeluaran") continue;
    const d = Number((t.date || "").slice(-2)) - 1;
    if (d >= 0 && d < dim) byDay[d] += t.amount;
  }
  return byDay.map((v, i) => ({ label: String(i + 1), value: v }));
}

// ===========================================================================
// LAYAR 2 â€” Transaksi
// ===========================================================================
function viewTransactions() {
  const rows = filteredTxs();

  return `
    <div>
      <div class="page-head">
        <h2>ðŸ§¾ Transaksi</h2>
        <div class="page-head-actions">
          <button class="btn btn-ghost" style="font-size:13px;padding:8px 14px" data-action="manage-categories">Kelola kategori</button>
          <button class="btn btn-ghost" style="font-size:13px;padding:8px 14px" data-action="export-csv">â¬‡ Export CSV</button>
        </div>
      </div>

      ${filterBar()}

      <p class="filter-meta" id="filterMeta">${rows.length} transaksi</p>

      <section class="card" style="padding:0 20px" aria-label="Daftar Transaksi">
        ${rows.length > 0
          ? txListGrouped(rows)
          : `<div class="empty-state" style="padding:28px 0">
               <div>Tidak ada transaksi yang cocok.</div>
               <button class="filter-reset-btn" style="margin-top:8px" data-action="reset-filters">Atur ulang filter</button>
             </div>`}
      </section>

      ${viewHistory()}
    </div>`;
}

function filterBar() {
  const f = state.filters;
  return `
    <div class="filters">
      <input
        type="search"
        id="fQ"
        class="filter-search"
        placeholder="Cari catatan / kategoriâ€¦"
        value="${esc(f.q)}"
        aria-label="Cari transaksi"
        autocomplete="off"
      >
      <div class="filter-row">
        <select id="fType" class="filter-select" aria-label="Filter tipe">
          <option value="semua"       ${f.type === "semua"       ? "selected" : ""}>Semua tipe</option>
          <option value="pemasukan"   ${f.type === "pemasukan"   ? "selected" : ""}>Pemasukan</option>
          <option value="pengeluaran" ${f.type === "pengeluaran" ? "selected" : ""}>Pengeluaran</option>
        </select>
        <select id="fCat" class="filter-select" aria-label="Filter kategori">
          <option value="semua">Semua kategori</option>
          ${state.cats.map((c) =>
            `<option value="${c.id}" ${f.categoryId === c.id ? "selected" : ""}>${c.icon} ${esc(c.name)}</option>`
          ).join("")}
        </select>
        <input type="date" id="fFrom" class="filter-date" value="${f.from}" aria-label="Dari tanggal">
        <input type="date" id="fTo"   class="filter-date" value="${f.to}"   aria-label="Sampai tanggal">
      </div>
    </div>`;
}

function filteredTxs() {
  const f  = state.filters;
  const mk = state.month;
  return state.txs.filter((t) => {
    if (!(t.date || "").startsWith(mk)) return false;
    if (f.type !== "semua" && t.type !== f.type) return false;
    if (f.categoryId !== "semua" && t.categoryId !== f.categoryId) return false;
    if (f.from && t.date < f.from) return false;
    if (f.to   && t.date > f.to)   return false;
    if (f.q) {
      const hay = `${t.note || ""} ${catsById().get(t.categoryId)?.name || ""}`.toLowerCase();
      if (!hay.includes(f.q.toLowerCase())) return false;
    }
    return true;
  });
}

/** Daftar transaksi dikelompokkan per tanggal. */
function txListGrouped(rows) {
  // Kelompokkan per tanggal
  const groups = new Map();
  for (const t of rows) {
    const d = t.date || "0000-00-00";
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(t);
  }
  // Urutkan tanggal terbaru dulu
  const sorted = [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  return sorted.map(([date, txs]) => `
    <div class="tx-group-label">${esc(formatDateID(date).toUpperCase())}</div>
    ${txListHTML(txs)}
  `).join("");
}

/** Daftar transaksi tanpa grup. */
function txListHTML(rows) {
  return `<div class="tx-list">${rows.map(txRowHTML).join("")}</div>`;
}

function txRowHTML(t) {
  const c       = catsById().get(t.categoryId) || {};
  const isInc   = t.type === "pemasukan";
  const bgColor = c.color ? `${c.color}22` : (isInc ? "#c8f13522" : "#ff6b5f22");
  const fgColor = c.color || (isInc ? "var(--income)" : "var(--expense)");

  return `
    <div class="tx-row" data-tx-id="${t.id}">
      <span class="tx-icon" style="background:${bgColor};color:${fgColor}" aria-hidden="true">${c.icon || (isInc ? "ðŸ’¼" : "ðŸ“¦")}</span>
      <div class="tx-main">
        <div class="tx-cat">${esc(c.name || "Lainnya")}</div>
        ${t.note ? `<div class="tx-note">${esc(t.note)}</div>` : ""}
      </div>
      <div class="tx-right">
        <span class="tx-amount ${isInc ? "income" : "expense"}" data-amount>${formatSignedIDR(t.amount, t.type)}</span>
        ${t.photoId
          ? `<button class="tx-thumb-btn receipt-thumb-btn" data-action="view-photo" data-id="${t.photoId}" title="Lihat foto kwitansi" aria-label="Lihat foto kwitansi">
               <img data-photo-id="${t.photoId}" alt="">
             </button>`
          : ""}
        <div class="tx-actions">
          <button class="icon-btn-sm" data-action="edit-tx" data-id="${t.id}" title="Ubah transaksi" aria-label="Ubah transaksi">âœï¸</button>
          <button class="icon-btn-sm danger" data-action="delete-tx" data-id="${t.id}" title="Hapus transaksi" aria-label="Hapus transaksi">ðŸ—‘ï¸</button>
        </div>
      </div>
    </div>`;
}

// ===========================================================================
// Panel Riwayat Pengeditan (muncul di Dashboard & Transaksi)
// ===========================================================================
const HISTORY_ACTION_LABEL = { created: "Dibuat", updated: "Diubah", deleted: "Dihapus" };

function viewHistory() {
  const rows          = state.history;
  const [mon, yr]     = monthLabel(state.month).split(" ");

  return `
    <section class="card" aria-label="Riwayat Pengeditan">
      <div class="card-head">
        <div>
          <span class="kicker">${esc(mon)} ${esc(yr || "")}</span>
          <h2 class="card-title">ðŸ“œ Riwayat pengeditan</h2>
        </div>
      </div>
      ${rows.length > 0
        ? `<div class="history-list">${rows.map(historyItemHTML).join("")}</div>`
        : `<p class="empty-inline">Belum ada perubahan transaksi pada bulan ini.</p>`}
    </section>`;
}

function historyItemHTML(h) {
  const label   = HISTORY_ACTION_LABEL[h.action] || h.action;
  const dotClass = h.action === "created" ? "created" : h.action === "deleted" ? "deleted" : "updated";
  const changes  = h.action === "updated" ? historyChangesHTML(h.before, h.after) : "";

  return `
    <div class="history-item">
      <span class="history-dot ${dotClass}" aria-hidden="true"></span>
      <div class="history-main">
        <div class="history-top">
          <span class="history-action">${esc(label)}</span>
          <span class="history-time">${esc(formatHistoryTime(h.createdAt))}</span>
        </div>
        <div class="history-summary">${esc(h.summary)}</div>
        ${changes}
      </div>
    </div>`;
}

function historyChangesHTML(before, after) {
  const b = before || {};
  const a = after  || {};
  const fields = [
    { key: "amount",    label: "Jumlah",     fmt: (v) => formatIDR(v) },
    { key: "type",      label: "Jenis",      fmt: (v) => v === "pemasukan" ? "Pemasukan" : "Pengeluaran" },
    { key: "category",  label: "Kategori",   fmt: (v) => v || "â€”" },
    { key: "date",      label: "Tanggal",    fmt: (v) => formatDateLong(v) },
    { key: "note",      label: "Catatan",    fmt: (v) => v || "â€”" },
    { key: "has_photo", label: "Foto bukti", fmt: (v) => v ? "Ada" : "Tidak ada" },
  ];
  const diffs = fields.filter((f) => String(b[f.key] ?? "") !== String(a[f.key] ?? ""));
  if (!diffs.length) {
    return `<div class="history-nochange">Disimpan tanpa perubahan nilai.</div>`;
  }
  return `<ul class="history-changes">${diffs.map((f) => `
    <li class="history-change-item">
      <span class="hc-field">${esc(f.label)}:</span>
      <span class="hc-old">${esc(f.fmt(b[f.key]))}</span>
      <span class="hc-arrow">â†’</span>
      <span class="hc-new">${esc(f.fmt(a[f.key]))}</span>
    </li>`).join("")}</ul>`;
}

// ===========================================================================
// LAYAR 3 â€” Anggaran
// ===========================================================================
function viewBudgets() {
  const mk = state.month;
  const categoryMap = catsById();

  // Kategori bertipe pengeluaran atau keduanya
  const expenseCats = state.cats.filter(
    (c) => c.type === "pengeluaran" || c.type === "keduanya"
  );

  // Pengeluaran per kategori bulan ini
  const spentByCat = new Map();
  for (const t of state.txs) {
    if (t.type !== "pengeluaran" || !(t.date || "").startsWith(mk)) continue;
    spentByCat.set(t.categoryId, (spentByCat.get(t.categoryId) || 0) + t.amount);
  }

  const rowCats = [...expenseCats];
  for (const categoryId of spentByCat.keys()) {
    if (rowCats.some((c) => c.id === categoryId)) continue;
    const fallback = categoryMap.get(categoryId) || {
      id: categoryId || "cat-lainnya",
      name: "Lainnya",
      icon: "📦",
      color: "#6b7280",
      type: "keduanya",
    };
    rowCats.push(fallback);
  }

  const rows = rowCats.map((c) => {
    const limit  = state.budgets[c.id] || 0;
    const spent  = spentByCat.get(c.id) || 0;
    const pct    = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
    const status = !limit ? "none" : pct >= 100 ? "over" : pct >= 70 ? "warn" : "ok";
    return { c, limit, spent, pct, status };
  });

  const totalLimit = rows.reduce((s, r) => s + r.limit, 0);
  const totalSpent = [...spentByCat.values()].reduce((s, n) => s + n, 0);
  const totalPct   = totalLimit > 0 ? Math.min(100, Math.round((totalSpent / totalLimit) * 100)) : 0;

  return `
    <div>
      <div class="page-head">
        <h2>ðŸŽ¯ Anggaran bulanan Â· ${esc(monthLabel(mk))}</h2>
      </div>

      <section class="card" aria-label="Ringkasan Anggaran">
        ${totalLimit > 0
          ? `<div class="budget-total-row">
               Total terpakai <strong>${formatIDR(totalSpent)}</strong> dari <strong>${formatIDR(totalLimit)}</strong>
               <div class="progress" role="progressbar" aria-valuenow="${totalPct}" aria-valuemin="0" aria-valuemax="100">
                 <div class="progress-fill ${totalSpent > totalLimit ? "over" : ""}" style="width:${totalPct}%"></div>
               </div>
             </div>`
          : `<p class="empty-inline">Belum ada anggaran. Atur batas belanja per kategori agar pengeluaran terkendali.</p>`}

        <div class="budget-list">
          ${rows.map(({ c, limit, spent, pct, status }) => {
            const bgColor = c.color ? `${c.color}22` : "#6b728022";
            const fgColor = c.color || "#6b7280";
            return `
              <div class="budget-row">
                <span class="tx-icon" style="background:${bgColor};color:${fgColor}" aria-hidden="true">${c.icon}</span>
                <div class="budget-main">
                  <div class="budget-name-row">
                    <span class="budget-name">${esc(c.name)}</span>
                    <span class="budget-nums">${limit ? `${formatIDR(spent)} / ${formatIDR(limit)}` : formatIDR(spent)}</span>
                  </div>
                  ${limit
                    ? `<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
                         <div class="progress-fill ${status === "over" ? "over" : status === "warn" ? "warn" : ""}" style="width:${pct}%"></div>
                       </div>
                       <p class="budget-status-text ${status === "over" ? "over" : status === "warn" ? "warn" : ""}">
                         ${status === "over"
                           ? `âš ï¸ Melewati batas sebesar ${formatIDR(spent - limit)}`
                           : status === "warn"
                           ? `Hati-hati, sudah ${pct}% dari batas`
                           : `${pct}% dari batas`}
                       </p>`
                    : `<p class="budget-status-text">Belum ada batas â€”
                         <button class="link-btn" data-action="set-budget" data-id="${c.id}">atur anggaran</button>
                       </p>`}
                </div>
                <div class="budget-actions">
                  ${limit
                    ? `<button class="icon-btn-sm" data-action="set-budget"    data-id="${c.id}" title="Ubah anggaran"  aria-label="Ubah anggaran ${esc(c.name)}">âœï¸</button>
                       <button class="icon-btn-sm danger" data-action="delete-budget" data-id="${c.id}" title="Hapus anggaran" aria-label="Hapus anggaran ${esc(c.name)}">ðŸ—‘ï¸</button>`
                    : ""}
                </div>
              </div>`;
          }).join("")}
        </div>
      </section>
    </div>`;
}

// ===========================================================================
// Modal & Dialog (bottom sheet)
// ===========================================================================
function openModal(html) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop" data-action="modal-close" role="presentation">
      <div class="modal" role="dialog" aria-modal="true">${html}</div>
    </div>`;
  // Klik di dalam modal tidak menutup
  root.querySelector(".modal").addEventListener("click", (e) => e.stopPropagation());
  // Fokus ke elemen pertama
  const first = root.querySelector("input:not([type=file]), select, button.btn-primary");
  if (first) setTimeout(() => first.focus(), 50);
}

function closeModal() {
  document.getElementById("modalRoot").innerHTML = "";
}

function confirmDialog(message) {
  return new Promise((resolve) => {
    const root = document.getElementById("modalRoot");
    root.innerHTML = `
      <div class="modal-backdrop" role="presentation">
        <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle">
          <h3 class="modal-title" id="confirmTitle">Konfirmasi</h3>
          <p style="color:var(--text-muted);margin-bottom:4px">${esc(message)}</p>
          <div class="modal-actions">
            <button class="btn btn-ghost" id="confirmNo">Batal</button>
            <button class="btn btn-danger" id="confirmYes">Ya, lanjutkan</button>
          </div>
        </div>
      </div>`;
    root.querySelector(".modal").addEventListener("click", (e) => e.stopPropagation());
    root.querySelector("#confirmNo").onclick  = () => { closeModal(); resolve(false); };
    root.querySelector("#confirmYes").onclick = () => { closeModal(); resolve(true); };
    setTimeout(() => root.querySelector("#confirmNo")?.focus(), 50);
  });
}

function toast(msg, isError = false) {
  const root = document.getElementById("toastRoot");
  const el   = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = msg;
  root.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("show")));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

// ===========================================================================
// Foto kwitansi
// ===========================================================================
const PHOTO_MAX_PRE    = 15 * 1024 * 1024;   // 15 MB
const PHOTO_MAX_SIDE   = 1600;
const PHOTO_JPEG_Q     = 0.8;
const PHOTO_MAX_RESULT = 4 * 1024 * 1024;    // 4 MB

function compressReceipt(file) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || "").startsWith("image/")) {
      reject(new Error("Pilih file gambar.")); return;
    }
    if (file.size > PHOTO_MAX_PRE) {
      reject(new Error("Ukuran foto melebihi 15MB.")); return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale  = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.width, img.height));
      const w      = Math.max(1, Math.round(img.width  * scale));
      const h      = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error("Gagal memproses foto.")); return; }
        if (blob.size > PHOTO_MAX_RESULT) {
          reject(new Error("Hasil kompresi masih melebihi 4MB.")); return;
        }
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Gagal membaca foto."));
        reader.readAsDataURL(blob);
      }, "image/jpeg", PHOTO_JPEG_Q);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("File gambar tidak dapat dibaca.")); };
    img.src = url;
  });
}

function openPhotoViewer(dataUrl) {
  openModal(`
    <div class="photo-viewer">
      <button class="photo-viewer-close" data-action="modal-close" title="Tutup" aria-label="Tutup">âœ•</button>
      <img src="${dataUrl}" alt="Foto kwitansi">
    </div>`);
}

// ===========================================================================
// Modal Transaksi
// ===========================================================================
function categoryOptions(selectedId, type) {
  return state.cats
    .filter((c) => c.type === type || c.type === "keduanya")
    .map((c) =>
      `<option value="${c.id}" ${selectedId === c.id ? "selected" : ""}>${c.icon} ${esc(c.name)}</option>`
    ).join("");
}

function openTxModal(existing = null) {
  const tx = existing || {
    type: "pengeluaran",
    amount: "",
    categoryId: "cat-makanan",
    date: toISODate(),
    note: "",
  };

  openModal(`
    <h3 class="modal-title">${existing ? "Ubah transaksi" : "Tambah transaksi"}</h3>
    <form id="txForm" novalidate>
      <div class="type-toggle" role="group" aria-label="Tipe transaksi">
        <button type="button" class="toggle-btn ${tx.type === "pengeluaran" ? "active expense" : ""}" data-tx-type="pengeluaran">Pengeluaran</button>
        <button type="button" class="toggle-btn ${tx.type === "pemasukan"   ? "active income"  : ""}" data-tx-type="pemasukan">Pemasukan</button>
      </div>

      <label class="form-label">
        <span class="label-text">Jumlah (Rp)</span>
        <input class="form-input" type="number" id="txAmount" min="1" step="1" inputmode="numeric"
               required value="${tx.amount || ""}" placeholder="mis. 50000">
      </label>

      <label class="form-label">
        <span class="label-text">Kategori</span>
        <select class="form-select" id="txCategory">${categoryOptions(tx.categoryId, tx.type)}</select>
      </label>

      <label class="form-label">
        <span class="label-text">Tanggal</span>
        <input class="form-input" type="date" id="txDate" required value="${tx.date}">
      </label>

      <label class="form-label">
        <span class="label-text">Catatan (opsional)</span>
        <input class="form-input" type="text" id="txNote" maxlength="120"
               value="${esc(tx.note || "")}" placeholder="mis. Makan siang">
      </label>

      <div class="form-label">
        <span class="label-text">Foto kwitansi/bukti</span>
        <span class="photo-field-hint">Opsional Â· otomatis diperkecil agar tetap cepat</span>
        <input type="file" id="txPhotoGallery" accept="image/*" hidden>
        <input type="file" id="txPhotoCamera"  accept="image/*" capture="environment" hidden>
        <div id="photoArea"></div>
        <div class="photo-status" id="photoStatus" hidden></div>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="modal-close">Batal</button>
        <button type="submit" class="btn btn-primary">${existing ? "Simpan perubahan" : "Tambah"}</button>
      </div>
    </form>`);

  // ---- tipe toggle ----
  let currentType = tx.type;
  document.querySelectorAll("[data-tx-type]").forEach((b) => {
    b.onclick = () => {
      currentType = b.dataset.txType;
      document.querySelectorAll("[data-tx-type]").forEach((x) =>
        x.classList.remove("active", "income", "expense")
      );
      b.classList.add("active", currentType === "pemasukan" ? "income" : "expense");
      const sel  = document.getElementById("txCategory");
      const keep = sel.value;
      sel.innerHTML = categoryOptions(keep, currentType);
    };
  });

  // ---- foto ----
  let draftPhoto   = null;
  let draftIsNew   = false;
  let photoRemoved = false;
  const oldPhotoId = existing?.photoId || null;

  function renderPhotoArea() {
    const area = document.getElementById("photoArea");
    if (!area) return;
    if (draftPhoto) {
      area.innerHTML = `
        <div class="photo-preview-wrap">
          <button type="button" class="photo-preview" id="photoPreviewBtn" title="Lihat ukuran penuh" aria-label="Lihat foto ukuran penuh">
            <img src="${draftPhoto}" alt="Pratinjau foto kwitansi">
          </button>
          <div class="photo-row" style="margin-top:8px">
            <button type="button" class="btn btn-ghost" id="photoReplaceBtn">Ganti</button>
            <button type="button" class="btn btn-ghost" id="photoRemoveBtn">Hapus foto</button>
          </div>
        </div>`;
      document.getElementById("photoPreviewBtn").onclick = () => openPhotoViewer(draftPhoto);
      document.getElementById("photoReplaceBtn").onclick = () => document.getElementById("txPhotoGallery").click();
      document.getElementById("photoRemoveBtn").onclick  = () => {
        draftPhoto = null; draftIsNew = false; photoRemoved = true;
        renderPhotoArea();
      };
    } else {
      area.innerHTML = `
        <div class="photo-row">
          <button type="button" class="btn btn-ghost photo-btn-camera" id="photoCameraBtn">ðŸ“· Ambil foto</button>
          <button type="button" class="btn btn-ghost photo-btn-gallery-mobile" id="photoGalleryBtnM">ðŸ–¼ï¸ Pilih galeri</button>
          <button type="button" class="btn btn-ghost photo-btn-gallery-desktop" id="photoGalleryBtnD">Pilih file foto</button>
        </div>`;
      document.getElementById("photoCameraBtn")?.addEventListener("click",
        () => document.getElementById("txPhotoCamera").click());
      document.getElementById("photoGalleryBtnM")?.addEventListener("click",
        () => document.getElementById("txPhotoGallery").click());
      document.getElementById("photoGalleryBtnD")?.addEventListener("click",
        () => document.getElementById("txPhotoGallery").click());
    }
  }

  async function handlePhotoFile(file) {
    const status    = document.getElementById("photoStatus");
    const submitBtn = document.querySelector("#txForm button[type=submit]");
    if (!status) return;
    status.hidden = false;
    status.className = "photo-status";
    status.textContent = "Memperkecil fotoâ€¦";
    if (submitBtn) submitBtn.disabled = true;
    try {
      const dataUrl = await compressReceipt(file);
      if (!document.getElementById("photoArea")) return;
      draftPhoto = dataUrl; draftIsNew = true; photoRemoved = false;
      status.hidden = true;
      renderPhotoArea();
    } catch (err) {
      if (!document.getElementById("photoArea")) return;
      status.className = "photo-status error";
      status.textContent = err.message;
    } finally {
      const btn = document.querySelector("#txForm button[type=submit]");
      if (btn) btn.disabled = false;
    }
  }

  const onFileChange = (e) => {
    if (e.target.files?.[0]) handlePhotoFile(e.target.files[0]);
    e.target.value = "";
  };
  document.getElementById("txPhotoGallery").onchange = onFileChange;
  document.getElementById("txPhotoCamera").onchange  = onFileChange;

  // Muat pratinjau foto lama (mode ubah)
  if (oldPhotoId) {
    photoDataUrl(oldPhotoId).then((url) => {
      if (url && document.getElementById("photoArea")) {
        draftPhoto = url; draftIsNew = false;
        renderPhotoArea();
      }
    });
  }
  renderPhotoArea();

  // ---- submit ----
  document.getElementById("txForm").onsubmit = async (e) => {
    e.preventDefault();
    const amountRaw = document.getElementById("txAmount").value;
    const amount    = Math.round(Number(amountRaw));
    if (!amountRaw || !Number.isFinite(amount) || amount <= 0) {
      toast("Jumlah harus lebih dari 0.", true); return;
    }
    const dateVal = document.getElementById("txDate").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
      toast("Tanggal tidak valid.", true); return;
    }
    const payload = {
      type:       currentType,
      amount:     amount,
      categoryId: document.getElementById("txCategory").value,
      date:       dateVal,
      note:       document.getElementById("txNote").value.trim(),
    };
    let newPhotoId = null;
    try {
      if (draftIsNew && draftPhoto) {
        newPhotoId     = await store.savePhoto(draftPhoto);
        payload.photoId = newPhotoId;
      } else if (photoRemoved) {
        payload.photoId = null;
      }
      if (existing) await store.updateTransaction(existing.id, payload);
      else           await store.addTransaction(payload);
      // Bersihkan foto lama yang diganti/dihapus
      if (newPhotoId && oldPhotoId && oldPhotoId !== newPhotoId) {
        photoCache.delete(oldPhotoId);
        await store.deletePhoto(oldPhotoId);
      }
      if (photoRemoved && oldPhotoId) {
        photoCache.delete(oldPhotoId);
        await store.deletePhoto(oldPhotoId);
      }
      if (newPhotoId) photoCache.set(newPhotoId, draftPhoto);
      closeModal();
      await reloadData();
      render();
      toast(existing ? "Transaksi diperbarui." : "Transaksi ditambahkan.");
    } catch (err) {
      if (newPhotoId) await store.deletePhoto(newPhotoId); // rollback blob yatim
      toast(err.message, true);
    }
  };
}

// ===========================================================================
// Modal Kategori
// ===========================================================================
function openManageCategories() {
  const rows = state.cats.map((c) => `
    <div class="cat-row">
      <span class="tx-icon" style="background:${c.color}22;color:${c.color}" aria-hidden="true">${c.icon}</span>
      <div class="cat-main">
        <div class="cat-name">${esc(c.name)}</div>
        <div class="cat-type-label">${c.type === "keduanya" ? "Pemasukan & pengeluaran" : c.type === "pemasukan" ? "Pemasukan" : "Pengeluaran"}</div>
      </div>
      <div class="cat-actions">
        <button class="icon-btn-sm" data-action="edit-category"   data-id="${c.id}" title="Ubah"  aria-label="Ubah ${esc(c.name)}">âœï¸</button>
        <button class="icon-btn-sm danger" data-action="delete-category" data-id="${c.id}" title="Hapus" aria-label="Hapus ${esc(c.name)}">ðŸ—‘ï¸</button>
      </div>
    </div>`).join("");

  openModal(`
    <h3 class="modal-title">Kelola kategori</h3>
    <div class="cat-list">${rows}</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="modal-close">Tutup</button>
      <button class="btn btn-primary" data-action="add-category">ï¼‹ Kategori baru</button>
    </div>`);
}

function openCategoryModal(existing = null) {
  const c = existing || { name: "", icon: "ðŸ“¦", color: "#6b7280", type: "keduanya" };
  openModal(`
    <h3 class="modal-title">${existing ? "Ubah kategori" : "Tambah kategori"}</h3>
    <form id="catForm" novalidate>
      <label class="form-label">
        <span class="label-text">Nama</span>
        <input class="form-input" type="text" id="catName" required maxlength="40"
               value="${esc(c.name)}" placeholder="mis. Langganan">
      </label>
      <label class="form-label">
        <span class="label-text">Ikon (emoji)</span>
        <input class="form-input" type="text" id="catIcon" maxlength="4" value="${esc(c.icon)}">
      </label>
      <label class="form-label">
        <span class="label-text">Warna</span>
        <input class="form-input" type="color" id="catColor" value="${c.color}" style="height:48px;padding:4px 10px;cursor:pointer">
      </label>
      <label class="form-label">
        <span class="label-text">Berlaku untuk</span>
        <select class="form-select" id="catType">
          <option value="keduanya"   ${c.type === "keduanya"   ? "selected" : ""}>Pemasukan &amp; pengeluaran</option>
          <option value="pemasukan"  ${c.type === "pemasukan"  ? "selected" : ""}>Pemasukan</option>
          <option value="pengeluaran"${c.type === "pengeluaran"? "selected" : ""}>Pengeluaran</option>
        </select>
      </label>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="modal-close">Batal</button>
        <button type="submit" class="btn btn-primary">${existing ? "Simpan" : "Tambah"}</button>
      </div>
    </form>`);

  document.getElementById("catForm").onsubmit = async (e) => {
    e.preventDefault();
    const nameVal = document.getElementById("catName").value.trim();
    if (!nameVal) { toast("Nama kategori wajib diisi.", true); return; }
    const payload = {
      name:  nameVal,
      icon:  document.getElementById("catIcon").value.trim() || "ðŸ“¦",
      color: document.getElementById("catColor").value,
      type:  document.getElementById("catType").value,
    };
    try {
      if (existing) await store.updateCategory(existing.id, payload);
      else           await store.addCategory(payload);
      closeModal();
      await reloadData();
      render();
      toast("Kategori disimpan.");
    } catch (err) {
      toast(err.message, true);
    }
  };
}

// ===========================================================================
// Modal Anggaran
// ===========================================================================
function openBudgetModal(categoryId) {
  const c = catsById().get(categoryId);
  if (!c) return;
  const current = state.budgets[categoryId] || "";
  openModal(`
    <h3 class="modal-title">Anggaran: ${c.icon} ${esc(c.name)}</h3>
    <form id="budgetForm" novalidate>
      <label class="form-label">
        <span class="label-text">Batas belanja per bulan (Rp)</span>
        <input class="form-input" type="number" id="budgetLimit" min="1" step="1"
               required value="${current}" placeholder="mis. 1000000">
      </label>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="modal-close">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>`);

  document.getElementById("budgetForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await store.setBudget(categoryId, document.getElementById("budgetLimit").value);
      closeModal();
      await reloadData();
      render();
      toast("Anggaran disimpan.");
    } catch (err) {
      toast(err.message, true);
    }
  };
}

// ===========================================================================
// Export CSV
// ===========================================================================
function exportCSV() {
  const rows = filteredTxs();
  if (!rows.length) { toast("Tidak ada data untuk diekspor.", true); return; }
  const header = "Tanggal,Tipe,Kategori,Jumlah (Rp),Catatan";
  const lines  = rows.map((t) => {
    const c = catsById().get(t.categoryId);
    const cells = [t.date, t.type, c?.name || "Lainnya", String(t.amount), t.note || ""];
    return cells.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });
  const blob = new Blob(
    ["\uFEFF" + header + "\n" + lines.join("\n")],
    { type: "text/csv;charset=utf-8" }
  );
  const a = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = `pelacak-keuangan-${toISODate()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(`Berhasil mengekspor ${rows.length} transaksi.`);
}

// ===========================================================================
// Event Wiring
// ===========================================================================
function wireEvents() {
  // Navigasi bulan
  document.getElementById("monthPrev").onclick = async () => {
    state.month = shiftMonth(state.month, -1);
    await reloadHistory(); render();
  };
  document.getElementById("monthNext").onclick = async () => {
    state.month = shiftMonth(state.month, 1);
    await reloadHistory(); render();
  };
  document.getElementById("monthLabel").onclick = async () => {
    state.month = toMonthKey();
    await reloadHistory(); render();
  };

  // Tombol tema
  document.getElementById("themeToggle").onclick = async () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    state.settings = await store.saveSettings({ theme: next });
    applyTheme();
  };

  // Tombol + Transaksi di sub-header
  const addTxBtn = document.getElementById("addTxBtn");
  if (addTxBtn) addTxBtn.onclick = () => openTxModal();

  // Filter â€” input (pencarian live tanpa reload)
  document.getElementById("view").addEventListener("input", (e) => {
    const id = e.target.id;
    if      (id === "fQ")    { state.filters.q = e.target.value; renderFilteredList(); }
    else if (id === "fType") { state.filters.type = e.target.value; render(); }
    else if (id === "fCat")  { state.filters.categoryId = e.target.value; render(); }
    else if (id === "fFrom") { state.filters.from = e.target.value; render(); }
    else if (id === "fTo")   { state.filters.to   = e.target.value; render(); }
  });

  // Delegasi klik global
  document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    const id     = el.dataset.id;
    try {
      switch (action) {
        case "nav":
          state.view = el.dataset.view;
          render();
          break;
        case "open-tx-modal":
          openTxModal();
          break;
        case "modal-close":
          closeModal();
          break;
        case "reset-filters":
          state.filters = { q: "", type: "semua", categoryId: "semua", from: "", to: "" };
          render();
          break;
        case "export-csv":
          exportCSV();
          break;
        case "manage-categories":
          openManageCategories();
          break;
        case "add-category":
          openCategoryModal();
          break;
        case "edit-category":
          openCategoryModal(catsById().get(id));
          break;
        case "set-budget":
          openBudgetModal(id);
          break;
        case "edit-tx": {
          const tx = await store.getTransaction(id);
          if (tx) openTxModal(tx);
          break;
        }
        case "view-photo": {
          const url = await photoDataUrl(id);
          if (url) openPhotoViewer(url);
          else toast("Foto tidak ditemukan.", true);
          break;
        }
        case "delete-tx":
          if (await confirmDialog("Hapus transaksi ini? Tindakan ini tidak bisa dibatalkan.")) {
            await store.deleteTransaction(id);
            await reloadData(); render();
            toast("Transaksi dihapus.");
          }
          break;
        case "delete-category":
          if (await confirmDialog(
            "Hapus kategori ini? Transaksinya akan dipindahkan ke kategori \"Lainnya\"."
          )) {
            await store.deleteCategory(id);
            await reloadData(); render();
            openManageCategories();
            toast("Kategori dihapus.");
          }
          break;
        case "delete-budget":
          if (await confirmDialog("Hapus anggaran kategori ini?")) {
            await store.deleteBudget(id);
            await reloadData(); render();
            toast("Anggaran dihapus.");
          }
          break;
      }
    } catch (err) {
      toast(err.message, true);
    }
  });

  // Tutup modal dengan Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

// Render ulang hanya daftar transaksi saat mengetik di pencarian
// agar fokus input tidak hilang.
function renderFilteredList() {
  if (state.view !== "transaksi") { render(); return; }

  const rows = filteredTxs();

  // Update counter
  const meta = document.getElementById("filterMeta");
  if (meta) meta.textContent = `${rows.length} transaksi`;

  // Update daftar
  const listWrap = document.querySelector("#view .card");
  if (!listWrap) return;
  listWrap.innerHTML = rows.length > 0
    ? txListGrouped(rows)
    : `<div class="empty-state" style="padding:28px 0">
         <div>Tidak ada transaksi yang cocok.</div>
         <button class="filter-reset-btn" style="margin-top:8px" data-action="reset-filters">Atur ulang filter</button>
       </div>`;
  hydratePhotoThumbs(listWrap);

  // Kembalikan fokus ke input pencarian
  const q = document.getElementById("fQ");
  if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}

