# Pelacak Keuangan 💰

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
| **Abstraksi `store`** (`js/store.js`) | Seluruh akses data lewat satu antarmuka async — ganti `LocalStorageStore` → `FirestoreStore` di Fase 2 tanpa menyentuh UI |
| **Capacitor 6** | Membungkus web app jadi aplikasi Android asli; skill web kepakai langsung |
| **Firebase (Auth + Firestore)** — Fase 2 | Backend multi-user tanpa kelola server; paket gratis cukup untuk awal |

## Struktur folder

```
pelacak-keuangan-app/
├── web/                    # Aplikasi web (tanpa build step)
│   ├── index.html
│   ├── styles.css
│   └── js/
│       ├── app.js          # Bootstrap + fallback anti-layar-putih
│       ├── ui.js           # Semua tampilan & interaksi
│       ├── store.js        # Lapisan data (saat ini localStorage; seam Firebase Fase 2)
│       ├── charts.js       # Grafik SVG: donat, bar, garis
│       ├── insights.js     # Insight otomatis Bahasa Indonesia (murni fungsi)
│       └── format.js       # Format IDR presisi penuh, tanggal, bulan
├── firebase/
│   ├── firestore.rules     # Aturan keamanan: isolasi data per-user (uid)
│   └── firebase.json       # Placeholder; proyek Firebase dibuat manual (Fase 2)
├── docs/
│   ├── firebase-setup.md   # Langkah membuat proyek Firebase + Auth + Firestore
│   └── play-store-checklist.md  # Checklist akun $25 → privacy policy → AAB → rilis
├── capacitor.config.ts     # appId com.arjuna.pelacakkeuangan, webDir: web/
├── package.json
└── .gitignore
```

## Peta fase

- **Fase 1 — Fondasi** ✅ (repo ini): web app penuh + Capacitor config + aturan Firestore + docs.
- **Fase 2 — Firebase wiring**: buat proyek Firebase (manual, lihat `docs/firebase-setup.md`),
  implementasikan `FirestoreStore` di `web/js/store.js` sesuai seam yang ditandai,
  tambah layar login/daftar.
- **Fase 3 — Akun Play Store**: daftar developer ($25), privacy policy, formulir
  data safety (lihat `docs/play-store-checklist.md`).
- **Fase 4 — Rilis**: build AAB → internal testing → review → production.
  (Alternatif: APK via GitHub Releases, gratis.)

## Cara menjalankan versi web

Butuh Node.js 18+.

```bash
cd pelacak-keuangan-app
npm install
npm run web        # membuka http://localhost:5173
```

> Jangan buka `web/index.html` langsung sebagai file — ES modules butuh server
> lokal. Aplikasi menampilkan pesan yang jelas bila ini terjadi.

Data tersimpan di **localStorage browser** (per perangkat). Di Fase 2 akan
berpindah ke Firestore per akun pengguna.

## Cara menambah platform Android

Butuh di mesin kamu: **Android Studio + JDK 17+** (tidak tersedia di mesin
pengembang awal ini — jadi langkah ini dilakukan di komputermu).

```bash
npm install
npx cap add android   # membuat folder android/ (masuk .gitignore bila perlu)
npx cap sync android  # salin web/ + plugin ke proyek Android
npx cap open android  # buka di Android Studio → Run / Build AAB
```

Setiap mengubah `web/`, jalankan `npx cap sync android` lagi sebelum build.

## Fitur (Fase 1)

- Dashboard: saldo, pemasukan/pengeluaran bulan ini, tingkat tabungan
- CRUD transaksi + konfirmasi hapus; kategori bawaan & kustom (ikon + warna)
- Filter: pencarian, tipe, kategori, rentang tanggal; navigasi bulanan
- Grafik: donat per kategori, bar 6 bulan, tren harian
- Anggaran per kategori + progress bar + peringatan batas
- Insight Bahasa Indonesia (tren, kategori terbesar, proyeksi, tabungan)
- Export CSV · mode terang/gelap · mobile-first responsif
- Angka rupiah **selalu presisi penuh** (`Rp12.500.000`) — tidak pernah
  dibulatkan kasar
- **Foto kwitansi opsional** — lampirkan bukti/foto pada tiap transaksi
  (kamera/galeri di ponsel, unggah file di desktop); kompresi otomatis
  (maks 1600px, JPEG 0.8), pratinjau, ganti, hapus, tampil penuh, thumbnail
  di daftar. Disimpan di IndexedDB (lokal); Firebase Storage di Fase 2.
- **Riwayat pengeditan per bulan** — log audit: transaksi dibuat/diubah/dihapus
  beserta nilai sebelum–sesudah per field, dilihat per bulan mengikuti
  navigasi bulan di header. Bersifat append-only (tidak ikut terhapus).

## Langkah selanjutnya (untuk pemilik proyek)

1. Coba versi web, catat yang kurang → iterasi.
2. Kerjakan **Fase 2** (`docs/firebase-setup.md`): proyek Firebase + wiring store.
3. Siapkan aset Play Store sambil jalan (`docs/play-store-checklist.md`).

## Status jujur

- ✅ Bisa langsung dijalankan & dipakai (data lokal).
- ⏳ Belum multi-user / login (Fase 2).
- ⏳ Belum ada aplikasi Android beneran / APK / AAB (butuh Android Studio).
- ⏳ Belum ada akun Play Store / listing (Fase 3).
