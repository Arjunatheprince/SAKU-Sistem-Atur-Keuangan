// ============================================================================
// js/insights.js — Insight otomatis dalam Bahasa Indonesia.
// Murni fungsi komputasi: menerima data, mengembalikan daftar insight.
// Tidak menyentuh DOM maupun store.
// ============================================================================

import { formatIDR, shiftMonth, daysInMonth, monthLabel } from "./format.js";

/**
 * @param {Array} transactions  semua transaksi (sudah terurut apa adanya)
 * @param {string} monthKey     bulan aktif, mis. "2026-09"
 * @param {Map} categoriesById  Map id -> kategori { name, icon, ... }
 * @returns {Array<{icon,title,text,tone}>} tone: "info" | "good" | "warn" | "bad"
 */
export function computeInsights(transactions, monthKey, categoriesById) {
  const insights = [];
  const inMonth = (t) => (t.date || "").startsWith(monthKey);
  const monthTx = transactions.filter(inMonth);
  if (!monthTx.length) return insights;

  const sum = (rows, type) => rows.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
  const income = sum(monthTx, "pemasukan");
  const expense = sum(monthTx, "pengeluaran");

  // 1. Perbandingan dengan rata-rata 3 bulan sebelumnya.
  const prevMonths = [1, 2, 3].map((n) => shiftMonth(monthKey, -n));
  const prevExpenses = prevMonths.map((mk) => sum(transactions.filter((t) => (t.date || "").startsWith(mk)), "pengeluaran"));
  const prevAvg = prevExpenses.reduce((a, b) => a + b, 0) / 3;
  if (prevAvg > 0) {
    const pct = Math.round(((expense - prevAvg) / prevAvg) * 100);
    if (pct >= 10) {
      insights.push({
        icon: "⚠️", tone: "warn", title: "Pengeluaran naik",
        text: `Pengeluaran bulan ini ${formatIDR(expense)}, naik ${pct}% dibanding rata-rata 3 bulan terakhir (${formatIDR(Math.round(prevAvg))}).`,
      });
    } else if (pct <= -10) {
      insights.push({
        icon: "🎉", tone: "good", title: "Pengeluaran turun",
        text: `Pengeluaran bulan ini ${formatIDR(expense)}, turun ${Math.abs(pct)}% dibanding rata-rata 3 bulan terakhir (${formatIDR(Math.round(prevAvg))}). Pertahankan!`,
      });
    } else {
      insights.push({
        icon: "➖", tone: "info", title: "Pengeluaran stabil",
        text: `Pengeluaran bulan ini ${formatIDR(expense)}, relatif stabil dibanding rata-rata 3 bulan terakhir (${formatIDR(Math.round(prevAvg))}).`,
      });
    }
  }

  // 2. Kategori pengeluaran terbesar.
  const byCat = new Map();
  for (const t of monthTx) {
    if (t.type !== "pengeluaran") continue;
    byCat.set(t.categoryId, (byCat.get(t.categoryId) || 0) + t.amount);
  }
  if (byCat.size) {
    const [topId, topVal] = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
    const cat = categoriesById.get(topId);
    const share = expense ? Math.round((topVal / expense) * 100) : 0;
    insights.push({
      icon: cat?.icon || "📦", tone: "info", title: "Kategori terbesar",
      text: `${cat?.name || "Lainnya"} menyerap ${formatIDR(topVal)} (${share}% dari total pengeluaran bulan ini).`,
    });
  }

  // 3. Pengeluaran tunggal terbesar.
  const expenses = monthTx.filter((t) => t.type === "pengeluaran");
  if (expenses.length) {
    const big = expenses.slice().sort((a, b) => b.amount - a.amount)[0];
    const cat = categoriesById.get(big.categoryId);
    insights.push({
      icon: "💸", tone: "info", title: "Pengeluaran tunggal terbesar",
      text: `${formatIDR(big.amount)} untuk ${cat?.name || "Lainnya"}${big.note ? ` — "${big.note}"` : ""}.`,
    });
  }

  // 4. Proyeksi akhir bulan (berbasis rata-rata harian bulan berjalan).
  const today = new Date();
  const isCurrentMonth =
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}` === monthKey;
  const dim = daysInMonth(monthKey);
  if (isCurrentMonth && today.getDate() < dim && expense > 0) {
    const day = today.getDate();
    const projected = Math.round((expense / day) * dim);
    insights.push({
      icon: "🔮", tone: projected > expense * 1.2 ? "warn" : "info",
      title: "Proyeksi akhir bulan",
      text: `Dengan laju saat ini, pengeluaran ${monthLabel(monthKey)} diproyeksikan mencapai ${formatIDR(projected)}.`,
    });
  }

  // 5. Tingkat tabungan.
  if (income > 0) {
    const rate = Math.round(((income - expense) / income) * 100);
    insights.push({
      icon: rate >= 20 ? "🏦" : rate >= 0 ? "📊" : "🚨",
      tone: rate >= 20 ? "good" : rate >= 0 ? "info" : "bad",
      title: "Tingkat tabungan",
      text: rate >= 0
        ? `Kamu menabung ${rate}% dari pemasukan bulan ini (${formatIDR(income - expense)} dari ${formatIDR(income)}).`
        : `Pengeluaran melebihi pemasukan sebesar ${formatIDR(expense - income)} bulan ini. Waspada defisit!`,
    });
  }

  return insights;
}
