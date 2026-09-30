// ============================================================================
// js/app.js — Titik masuk aplikasi.
// Tugasnya hanya: inisialisasi UI. Seluruh logika ada di modul masing-masing.
// ============================================================================

import { init } from "./ui.js";

// Tampilkan pesan yang ramah bila modul gagal dimuat (mis. dibuka lewat
// file:// di browser lama) — jangan biarkan layar putih tanpa penjelasan.
window.addEventListener("error", (e) => {
  if (!document.getElementById("view")?.hasChildNodes()) {
    document.getElementById("view").innerHTML = `
      <section class="empty-hero">
        <div class="empty-hero-icon">⚠️</div>
        <h2>Aplikasi gagal dimuat</h2>
        <p>${e.message || "Terjadi kesalahan tak terduga."} Coba muat ulang halaman.</p>
        <button class="btn btn-primary" onclick="location.reload()">Muat ulang</button>
      </div>`;
  }
});

init().catch((err) => {
  console.error(err);
  const view = document.getElementById("view");
  if (view) {
    view.innerHTML = `
      <section class="empty-hero">
        <div class="empty-hero-icon">⚠️</div>
        <h2>Aplikasi gagal dimuat</h2>
        <p>${(err && err.message) || "Terjadi kesalahan tak terduga."} Coba muat ulang halaman.</p>
        <button class="btn btn-primary" onclick="location.reload()">Muat ulang</button>
      </div>`;
  }
});
