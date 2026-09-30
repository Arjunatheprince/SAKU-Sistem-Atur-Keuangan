# Checklist Play Store — Pelacak Keuangan

> Status Fase 1: **belum ada yang dikerjakan dari daftar ini.** Semua butuh akun
> dan tindakan manual pemilik aplikasi. Ditulis sejujur mungkin agar tidak ada
> langkah yang terlewat saat waktunya tiba (Fase 3–4).

## 1. Akun Google Play Developer — $25 sekali bayar
- [ ] Daftar di https://play.google.com/console/signup (butuh akun Google + kartu pembayaran).
- [ ] Verifikasi identitas (KTP/paspor) — proses Google, bisa butuh 1–2 hari.
- [ ] Pilih nama developer yang tampil publik (mis. nama kamu / studio).

## 2. Siapkan aset aplikasi
- [ ] **Ikon launcher** 512×512 PNG (tanpa alpha) — adaptif: foreground + background.
- [ ] **Feature graphic** 1024×500 PNG (banner halaman Play Store).
- [ ] **Screenshot**: minimal 2 screenshot ponsel (disarankan 4–8, ukuran 1080×1920 atau sejenis).
- [ ] Nama aplikasi: **Pelacak Keuangan** · kategori: Keuangan.
- [ ] Deskripsi singkat (≤80 karakter) + deskripsi lengkap (Bahasa Indonesia).
- [ ] Email kontak developer (tampil publik di listing).

## 3. Privacy Policy (WAJIB untuk aplikasi keuangan)
- [ ] Buat halaman privacy policy yang bisa diakses publik (mis. GitHub Pages dari repo ini).
- [ ] Isinya jujur: data apa yang disimpan (transaksi, kategori, anggaran),
      di mana (Firebase/Firestore milik developer), bahwa data tidak dijual,
      dan cara pengguna menghapus akun + datanya.
- [ ] Cantumkan URL-nya di Play Console (wajib diisi sebelum rilis).

## 4. Formulir Data Safety (Keamanan Data)
- [ ] Isi di Play Console → **App content → Data safety**.
- [ ] Deklarasikan: data keuangan dikumpulkan, disimpan di server (Firebase),
      tidak dibagikan ke pihak ketiga, data dienkripsi saat transit & tersimpan.
- [ ] Jawaban harus konsisten dengan privacy policy.

## 5. App signing & build rilis
- [ ] Di Android Studio / mesin build: `npx cap sync android`, buka di Android Studio.
- [ ] **Buat keystore rilis** (`keytool -genkeypair`) — SIMPAN file `.jks` +
      password-nya baik-baik; hilang = tidak bisa update aplikasi lagi.
- [ ] Daftarkan **Play App Signing** (disarankan: Google yang menyimpan kunci).
- [ ] Build **AAB** (Android App Bundle) — format wajib Play Store, bukan APK.

## 6. Rilis bertahap
- [ ] Upload AAB ke **Internal testing** dulu → uji di HP sendiri.
- [ ] Lengkapi **App content**: kategori, rating konten (kuesioner), target audiens.
- [ ] Naik ke **Closed testing** (opsional) → lalu **Production**.
- [ ] Review Google: biasanya 1–7 hari untuk aplikasi baru.

## Alternatif tanpa Play Store (gratis, lebih cepat)
- Build **APK** debug/rilis → unggah ke **GitHub Releases** repo ini.
- Pengguna mengunduh dan mengaktifkan "Install unknown apps" — cocok untuk
  tahap beta / portofolio, tanpa biaya $25 dan tanpa review.

## Yang TIDAK dijanjikan Fase 1
- Repo ini belum berisi folder `android/` (dibuat dengan `npx cap add android`
  di mesin yang punya Android Studio + JDK).
- Belum ada keystore, belum ada AAB/APK, belum ada listing Play Store.
