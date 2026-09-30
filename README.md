# SAKU-Sistem Atur Keuangan

Aplikasi pencatat keuangan pribadi berbahasa Indonesia: catat pemasukan dan
pengeluaran, lampirkan foto kwitansi, kelola kategori, atur anggaran bulanan,
lihat grafik arus kas, telusuri riwayat perubahan, dan dapatkan insight
otomatis. Dibangun sebagai **codebase nyata** yang siap
dibawa ke Android (Capacitor) dan diterbitkan ke Play Store.

> Rebuild dari prototipe web internal. Versi ini adalah fondasi **Fase 1**:
> aplikasi web penuh yang berjalan lokal + konfigurasi siap-Android.

## Tech stack & alasan

| Pilihan | Alasan |
|---|---|
| **Vanilla HTML/CSS/JS (ES modules), tanpa build step** | Nol tooling untuk jalan; file `web/` bisa dibuka/dihosting di mana saja; mudah dipahami perekrut/kontributor |
| **Grafik SVG hand-rolled** (`js/charts.js`) | Tanpa dependensi chart yang berat; tetap tajam di semua layar |
| **Abstraksi `store`** (`js/store.js`) | Seluruh akses data lewat satu antarmuka async â€” ganti `LocalStorageStore` â†’ `FirestoreStore` di Fase 2 tanpa menyentuh UI |
| **Capacitor 6** | Membungkus web app jadi aplikasi Android asli; skill web kepakai langsung |
| **Firebase (Auth + Firestore)** â€” Fase 2 | Backend multi-user tanpa kelola server; paket gratis cukup untuk awal |

## Struktur folder

```
SAKU-Sistem-Atur-Keuangan/
â”œâ”€â”€ web/                    # Aplikasi web (tanpa build step)
â”‚   â”œâ”€â”€ index.html
â”‚   â”œâ”€â”€ styles.css
â”‚   â””â”€â”€ js/
â”‚       â”œâ”€â”€ app.js          # Bootstrap + fallback anti-layar-putih
â”‚       â”œâ”€â”€ ui.js           # Semua tampilan & interaksi
â”‚       â”œâ”€â”€ store.js        # Lapisan data (saat ini localStorage; seam Firebase Fase 2)
â”‚       â”œâ”€â”€ charts.js       # Grafik SVG: donat, bar, garis
â”‚       â”œâ”€â”€ insights.js     # Insight otomatis Bahasa Indonesia (murni fungsi)
â”‚       â””â”€â”€ format.js       # Format IDR presisi penuh, tanggal, bulan
â”œâ”€â”€ firebase/
â”‚   â”œâ”€â”€ firestore.rules     # Aturan keamanan: isolasi data per-user (uid)
â”‚   â””â”€â”€ firebase.json       # Placeholder; proyek Firebase dibuat manual (Fase 2)
â”œâ”€â”€ docs/
â”‚   â”œâ”€â”€ firebase-setup.md   # Langkah membuat proyek Firebase + Auth + Firestore
â”‚   â””â”€â”€ play-store-checklist.md  # Checklist akun $25 â†’ privacy policy â†’ AAB â†’ rilis
â”œâ”€â”€ capacitor.config.ts     # appId com.arjuna.pelacakkeuangan, webDir: web/
â”œâ”€â”€ package.json
â””â”€â”€ .gitignore
```

## Peta fase

- **Fase 1 â€” Fondasi** âœ… (repo ini): web app penuh + Capacitor config + aturan Firestore + docs.
- **Fase 2 â€” Firebase wiring**: buat proyek Firebase (manual, lihat `docs/firebase-setup.md`),
  implementasikan `FirestoreStore` di `web/js/store.js` sesuai seam yang ditandai,
  tambah layar login/daftar.
- **Fase 3 â€” Akun Play Store**: daftar developer ($25), privacy policy, formulir
  data safety (lihat `docs/play-store-checklist.md`).
- **Fase 4 â€” Rilis**: build AAB â†’ internal testing â†’ review â†’ production.
  (Alternatif: APK via GitHub Releases, gratis.)

## Cara menjalankan versi web

Butuh Node.js 18+.

```bash
cd SAKU-Sistem-Atur-Keuangan
npm install
npm run web        # membuka http://localhost:5173
```

> Jangan buka `web/index.html` langsung sebagai file â€” ES modules butuh server
> lokal. Aplikasi menampilkan pesan yang jelas bila ini terjadi.

Data tersimpan di **localStorage browser** (per perangkat). Di Fase 2 akan
berpindah ke Firestore per akun pengguna.

## Cara menambah platform Android

Butuh di mesin kamu: **Android Studio + JDK 17+** (tidak tersedia di mesin
pengembang awal ini â€” jadi langkah ini dilakukan di komputermu).

```bash
npm install
npx cap add android   # membuat folder android/ (masuk .gitignore bila perlu)
npx cap sync android  # salin web/ + plugin ke proyek Android
npx cap open android  # buka di Android Studio â†’ Run / Build AAB
```

Setiap mengubah `web/`, jalankan `npx cap sync android` lagi sebelum build.

## Fitur (Fase 1)

- Dashboard: saldo, pemasukan/pengeluaran bulan ini, tingkat tabungan
- CRUD transaksi + konfirmasi hapus; kategori bawaan & kustom (ikon + warna)
- Filter: pencarian, tipe, kategori, rentang tanggal; navigasi bulanan
- Grafik: donat per kategori, bar 6 bulan, tren harian
- Anggaran per kategori + progress bar + peringatan batas
- Insight Bahasa Indonesia (tren, kategori terbesar, proyeksi, tabungan)
- Export CSV Â· mode terang/gelap Â· mobile-first responsif
- Angka rupiah **selalu presisi penuh** (`Rp12.500.000`) â€” tidak pernah
  dibulatkan kasar
- **Foto kwitansi opsional** â€” lampirkan bukti/foto pada tiap transaksi
  (kamera/galeri di ponsel, unggah file di desktop); kompresi otomatis
  (maks 1600px, JPEG 0.8), pratinjau, ganti, hapus, tampil penuh, thumbnail
  di daftar. Disimpan di IndexedDB (lokal); Firebase Storage di Fase 2.
- **Riwayat pengeditan per bulan** â€” log audit: transaksi dibuat/diubah/dihapus
  beserta nilai sebelumâ€“sesudah per field, dilihat per bulan mengikuti
  navigasi bulan di header. Bersifat append-only (tidak ikut terhapus).

## Langkah selanjutnya (untuk pemilik proyek)

1. Coba versi web, catat yang kurang â†’ iterasi.
2. Kerjakan **Fase 2** (`docs/firebase-setup.md`): proyek Firebase + wiring store.
3. Siapkan aset Play Store sambil jalan (`docs/play-store-checklist.md`).

## Status jujur

- âœ… Bisa langsung dijalankan & dipakai (data lokal).
- â³ Belum multi-user / login (Fase 2).
- â³ Belum ada aplikasi Android beneran / APK / AAB (butuh Android Studio).
- â³ Belum ada akun Play Store / listing (Fase 3).

