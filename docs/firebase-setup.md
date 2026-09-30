# Panduan Setup Firebase — Pelacak Keuangan

> Status Fase 1: **belum ada proyek Firebase yang dibuat.** Semua langkah di bawah
> dilakukan manual oleh pemilik aplikasi (kamu) di Firebase Console. Tidak ada
> akun, proyek, atau kredensial yang dibuat otomatis.

## 1. Buat proyek Firebase

1. Buka https://console.firebase.google.com dan login dengan akun Google.
2. Klik **Add project** / **Tambahkan proyek**, beri nama mis. `pelacak-keuangan`.
3. Ikuti wizard sampai selesai (Google Analytics opsional — boleh dimatikan).

## 2. Daftarkan aplikasi web

1. Di halaman Project Overview, klik ikon web `</>` (**Add an app**).
2. Nickname: `Pelacak Keuangan Web`.
3. **Jangan** centang Firebase Hosting (tidak dipakai di Fase 1–2).
4. Salin blok `firebaseConfig` yang ditampilkan. Contoh bentuknya:
   ```js
   const firebaseConfig = {
     apiKey: "...",
     authDomain: "pelacak-keuangan.firebaseapp.com",
     projectId: "pelacak-keuangan",
     storageBucket: "pelacak-keuangan.appspot.com",
     messagingSenderId: "...",
     appId: "...",
   };
   ```
5. Tempel config itu ke file **`web/js/firebase-config.js`** (file ini masuk `.gitignore`
   — jangan commit ke repo publik). Contoh isi file:
   ```js
   export const firebaseConfig = { /* ...dari console... */ };
   ```

## 3. Aktifkan Authentication

1. Di Console: **Build → Authentication → Get started**.
2. Tab **Sign-in method** → aktifkan **Email/Password**.
3. (Opsional, Fase 2+) tambah Google Sign-In bila diinginkan.

## 4. Buat Firestore Database

1. Di Console: **Build → Firestore Database → Create database**.
2. Pilih **Start in production mode** (aturan ketat), pilih lokasi server
   terdekat (mis. `asia-southeast1`).
3. Tab **Rules** → hapus isi bawaan → tempel seluruh isi
   `firebase/firestore.rules` dari repo ini → **Publish**.
4. Uji di tab **Rules Playground**: simulasikan read/write sebagai user
   terautentikasi vs anonim — yang anonim harus **ditolak**.

## 5. Hubungkan ke aplikasi (Fase 2)

Setelah langkah 1–4 selesai, Fase 2 mengganti `LocalStorageStore` di
`web/js/store.js` dengan `FirestoreStore` yang memakai `firebase-config.js`
dan aturan di atas. Detail implementasi ada di catatan seam pada `store.js`.

## Hal yang TIDAK dilakukan otomatis

- Tidak ada billing yang diaktifkan (paket gratis/Spark cukup untuk awal).
- Tidak ada data pengguna yang dibuat — koleksi `users/{uid}/...` terbentuk
  otomatis saat pengguna pertama mendaftar dan menyimpan data.
