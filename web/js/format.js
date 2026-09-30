// ============================================================================
// js/format.js — Utilitas format tampilan.
// PENTING: angka rupiah SELALU ditampilkan presisi penuh (mis. Rp12.500.000).
// Jangan pernah membulatkan kasar seperti "Rp 13 jt" — itu menyesatkan karena
// angka yang terlihat tidak bisa direkonsiliasi (12.500.000 − 2.230.000 = 10.270.000,
// bukan 11 jt).
// ============================================================================

const idrFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** "Rp12.500.000" — presisi penuh, tanpa desimal. */
export function formatIDR(n) {
  const v = Math.round(Number(n) || 0);
  return idrFormatter.format(v);
}

/** "+Rp500.000" / "−Rp250.000" untuk baris transaksi. */
export function formatSignedIDR(n, type) {
  const sign = type === "pemasukan" ? "+" : "−";
  return sign + formatIDR(Math.abs(Number(n) || 0));
}

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "2026-09-29" -> "29 Sep 2026" */
export function formatDateID(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`;
}

/** "2026-09-29" -> "29 September 2026" */
export function formatDateLong(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

/** ISO datetime -> "29 Sep, 15.45" (waktu lokal). */
export function formatHistoryTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const mon = MONTH_SHORT[d.getMonth()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${mon}, ${hh}.${mm}`;
}

/** "2026-09" -> "September 2026" */
export function monthLabel(monthKey) {
  const [y, m] = (monthKey || "").split("-").map(Number);
  if (!y || !m) return "—";
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** "2026-09" dari Date. */
export function toMonthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** "2026-09-29" dari Date (waktu lokal). */
export function toISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Geser monthKey sejauh n bulan. "2026-09" + (-1) -> "2026-08". */
export function shiftMonth(monthKey, n) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return toMonthKey(d);
}

/** Jumlah hari dalam bulan "2026-09" -> 30. */
export function daysInMonth(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** Escape HTML untuk teks yang berasal dari input pengguna. */
export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
