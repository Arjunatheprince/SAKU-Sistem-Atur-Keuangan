# AGENTS.md — Pelacak Keuangan 💰

> Konteks untuk AI coding agent (Antigravity, Cursor, VS Code, dsb.)
> yang bekerja di repo ini. Baca file ini dulu sebelum mengubah apa pun.

## Ringkasan

Aplikasi pencatat keuangan pribadi **berbahasa Indonesia**: CRUD transaksi,
kategori kustom, anggaran bulanan, grafik arus kas, insight otomatis, export
CSV, mode terang/gelap, mobile-first. Fondasi **Fase 1** menuju aplikasi
Android asli (Capacitor) + backend Firebase (Fase 2).

## Cara menjalankan

Butuh **Node.js 18+** (di mesin pengembang).

```bash
npm install
npm run web        # serve folder web/ di http://localhost:5173
```

- **Jangan** buka `web/index.html` langsung sebagai file (`file://`) —
  ES modules butuh server lokal. `app.js` menampilkan pesan yang jelas
  bila ini terjadi (anti-layar-putih).
- Data Fase 1 tersimpan di **localStorage browser** (per perangkat).

## Struktur

```
web/                  # Aplikasi web — TANPA build step, jangan tambah bundler
├── index.html
├── styles.css
└── js/
    ├── app.js        # Bootstrap + fallback anti-layar-putih
    ├── ui.js         # Semua tampilan & interaksi
    ├── store.js      # ★ Lapisan data — baca bagian "Aturan data" di bawah
    ├── charts.js     # Grafik SVG hand-rolled (donat, bar, garis)
    ├── insights.js   # Insight otomatis Bahasa Indonesia (fungsi murni)
    └── format.js     # Format IDR presisi penuh, tanggal, bulan
firebase/
├── firestore.rules   # Isolasi data per-user (uid) — ubah dengan hati-hati
└── firebase.json     # Placeholder; proyek Firebase dibuat manual (Fase 2)
docs/
├── firebase-setup.md        # Panduan manual buat proyek Firebase (Fase 2)
└── play-store-checklist.md  # Akun $25 → privacy policy → AAB → rilis
capacitor.config.ts   # appId com.arjuna.pelacakkeuangan, webDir: web/
package.json          # scripts: web, android:add/sync/open
```

## Aturan data (PENTING)

- **Seluruh akses data HANYA lewat `web/js/store.js`.**
  `ui.js`, `charts.js`, `insights.js` **dilarang** membaca localStorage /
  Firestore langsung.
- Antarmuka store adalah **async** dan **jangan ubah signature-nya** —
  Fase 2 akan mengganti `LocalStorageStore` → `FirestoreStore` tanpa
  menyentuh UI. Seam-nya sudah ditandai komentar `SEAM FASE 2` di `store.js`.
- Struktur koleksi yang direncanakan: `users/{uid}/...` (lihat
  `firebase/firestore.rules`).

## Konvensi

- UI **Bahasa Indonesia**. Insight & label grafik juga Indonesia.
- Rupiah **selalu presisi penuh** (`Rp12.500.000`) via `js/format.js` —
  jangan pernah pakai float math untuk uang, jangan membulatkan kasar.
- Grafik: SVG hand-rolled di `charts.js`, tanpa dependensi chart.
- Mobile-first, responsif. Dukung mode terang/gelap.
- Tetap **tanpa build step** — jangan tambah Vite/Webpack/dsb tanpa
  diskusi dengan pemilik proyek.

## Fase 2 — Firebase (belum dikerjakan)

1. Pemilik proyek membuat proyek Firebase **manual** (`docs/firebase-setup.md`).
2. Implementasikan `FirestoreStore` di `web/js/store.js` sesuai seam.
3. Tambah layar login/daftar (Firebase Auth).
- ⚠️ **JANGAN mengarang kredensial Firebase** (apiKey, projectId, dsb).
  Kalau belum ada, **minta ke pemilik proyek**.
- Foto kwitansi butuh Firebase Storage di Fase 2 (saat ini IndexedDB lokal);
  riwayat butuh koleksi `users/{uid}/history/...` (aturan append-only sudah
  disiapkan di `firebase/firestore.rules`).

## Android (Capacitor 6)

- Folder `android/` **belum ada** — dibuat di mesin pemilik via
  `npx cap add android` (butuh **Android Studio + JDK 17+**).
- Setiap mengubah `web/`, jalankan `npx cap sync android` sebelum build.
- Jangan commit kredensial keystore / `google-services.json` asli.

## Testing

- `node --check web/js/<file>.js` untuk cek sintaks tiap file JS.
- Uji manual di browser via `npm run web`; pastikan tidak ada layar putih
  dan data bertahan setelah refresh (localStorage).

## Status jujur

- ✅ Web app jalan & bisa dipakai (data lokal).
- ⏳ Belum multi-user/login (Fase 2) · ⏳ Belum ada APK/AAB (butuh Android
  Studio di mesin pemilik) · ⏳ Belum ada akun Play Store (Fase 3).
