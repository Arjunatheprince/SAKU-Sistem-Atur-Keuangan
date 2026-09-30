// ============================================================================
// js/charts.js — Grafik SVG buatan sendiri (tanpa library grafik).
// Semua fungsi mengembalikan string SVG yang bisa disisipkan ke innerHTML.
// Nilai pada tooltip SELALU memakai formatIDR (presisi penuh).
// ============================================================================

import { formatIDR, esc } from "./format.js";

/** Donat pengeluaran per kategori. data: [{ label, value, color }]. */
export function donutChart(data, size = 180) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) {
    return `<div class="chart-empty">Belum ada data pengeluaran bulan ini.</div>`;
  }
  const r = 70;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  let offset = 0;
  const segments = data
    .map((d) => {
      const frac = d.value / total;
      const len = Math.max(frac * c - 2, 0.5); // celah kecil antar segmen
      const s =
        `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${d.color}" ` +
        `stroke-width="28" stroke-dasharray="${len.toFixed(2)} ${c.toFixed(2)}" ` +
        `stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cx})">` +
        `<title>${esc(d.label)}: ${formatIDR(d.value)}</title></circle>`;
      offset += frac * c;
      return s;
    })
    .join("");
  const legend = data
    .map(
      (d) =>
        `<div class="legend-item"><span class="legend-dot" style="background:${d.color}"></span>` +
        `<span class="legend-label">${esc(d.label)}</span>` +
        `<span class="legend-value">${formatIDR(d.value)}</span></div>`
    )
    .join("");
  return (
    `<div class="donut-wrap"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" ` +
    `role="img" aria-label="Grafik donat pengeluaran per kategori">${segments}` +
    `<text x="${cx}" y="${cx - 6}" text-anchor="middle" class="donut-total-label">Total</text>` +
    `<text x="${cx}" y="${cx + 16}" text-anchor="middle" class="donut-total-value">${formatIDR(total)}</text>` +
    `</svg><div class="legend">${legend}</div></div>`
  );
}

/**
 * Bar chart pemasukan vs pengeluaran per bulan.
 * months: [{ key: "2026-09", label: "Sep", income, expense }]
 */
export function barsChart(months, width = 560, height = 220) {
  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expense]));
  const padL = 8, padB = 28, padT = 12;
  const plotH = height - padB - padT;
  const groupW = (width - padL * 2) / months.length;
  const barW = Math.min(26, groupW / 3);
  const y = (v) => padT + plotH - (v / max) * plotH;

  const bars = months
    .map((m, i) => {
      const gx = padL + i * groupW + groupW / 2;
      const inH = plotH - (y(m.income) - padT);
      const exH = plotH - (y(m.expense) - padT);
      return (
        `<rect x="${(gx - barW - 3).toFixed(1)}" y="${y(m.income).toFixed(1)}" width="${barW}" height="${inH.toFixed(1)}" rx="4" class="bar-income">` +
        `<title>${esc(m.label)} — Pemasukan: ${formatIDR(m.income)}</title></rect>` +
        `<rect x="${(gx + 3).toFixed(1)}" y="${y(m.expense).toFixed(1)}" width="${barW}" height="${exH.toFixed(1)}" rx="4" class="bar-expense">` +
        `<title>${esc(m.label)} — Pengeluaran: ${formatIDR(m.expense)}</title></rect>` +
        `<text x="${gx.toFixed(1)}" y="${height - 8}" text-anchor="middle" class="chart-axis">${esc(m.label)}</text>`
      );
    })
    .join("");

  return (
    `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="Grafik batang pemasukan vs pengeluaran 6 bulan">` +
    `${bars}</svg>` +
    `<div class="chart-legend-inline"><span class="legend-dot" style="background:var(--income)"></span> Pemasukan ` +
    `<span class="legend-dot" style="background:var(--expense)"></span> Pengeluaran</div>`
  );
}

/**
 * Grafik garis tren harian. points: [{ label: "1", value }].
 */
export function lineChart(points, width = 560, height = 200) {
  const values = points.map((p) => p.value);
  const max = Math.max(1, ...values);
  const padL = 8, padR = 8, padT = 14, padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const n = points.length;
  const x = (i) => (n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW);
  const y = (v) => padT + plotH - (v / max) * plotH;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${path} L${x(n - 1).toFixed(1)},${(padT + plotH).toFixed(1)} L${x(0).toFixed(1)},${(padT + plotH).toFixed(1)} Z`;

  // Label sumbu-x: tampilkan tiap ~5 hari agar tidak berdesakan.
  const step = Math.max(1, Math.ceil(n / 6));
  const labels = points
    .filter((_, i) => i % step === 0 || i === n - 1)
    .map((p, k, arr) => {
      const i = points.indexOf(p);
      return `<text x="${x(i).toFixed(1)}" y="${height - 8}" text-anchor="middle" class="chart-axis">${esc(p.label)}</text>`;
    })
    .join("");

  const dots = points
    .map(
      (p, i) =>
        `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.5" class="line-dot">` +
        `<title>Hari ${esc(p.label)}: ${formatIDR(p.value)}</title></circle>`
    )
    .join("");

  return (
    `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="Grafik garis tren pengeluaran harian">` +
    `<path d="${area}" class="line-area"/>` +
    `<path d="${path}" class="line-path" fill="none"/>` +
    `${dots}${labels}</svg>`
  );
}
