// ============================================================================
// js/store.js — Lapisan data aplikasi.
//
// ATURAN: seluruh akses data HARUS lewat antarmuka di file ini. Modul lain
// (ui, charts, insights) tidak boleh membaca localStorage / Firestore langsung.
//
// Implementasi saat ini: LocalStorageStore — penyimpanan lokal di perangkat.
// Semua method bersifat async (mengembalikan Promise) supaya bentuknya sama
// persis dengan API Firestore nanti. Jangan mengubah signature ini di Fase 2.
//
// ----------------------------------------------------------------------------
// SEAM FASE 2 — Firebase Auth + Firestore
// ----------------------------------------------------------------------------
// Ganti baris `export const store = new LocalStorageStore();` di bawah dengan
// implementasi FirestoreStore yang mematuhi antarmuka yang sama:
//
//   class FirestoreStore {
//     constructor(db, auth) { ... }
//     // ... method yang sama persis seperti di bawah ...
//   }
//
// Struktur koleksi yang direncanakan (lihat firebase/firestore.rules):
//   users/{uid}/transactions/{txId}   -> { type, amount, categoryId, date, note, createdAt }
//   users/{uid}/categories/{catId}    -> { name, icon, color, type }
//   users/{uid}/budgets/{categoryId}   -> { limit }
//   users/{uid}/settings/profile       -> { theme }
//
// WAJIB: setiap query dibatasi pada dokumen milik pengguna yang sedang login
// (request.auth.uid). Jangan pernah membaca koleksi lintas pengguna.
//
// FOTO KWITANSI (Fase 2): Firebase Storage, path receipts/{uid}/{photoId}.jpg.
// Firestore hanya menyimpan photoId pada transaksi (jangan embed base64 di
// dokumen). Riwayat: users/{uid}/history/{histId} — append-only, client tidak
// boleh mengubah/menghapus (lihat firebase/firestore.rules).
// ============================================================================

import { formatIDR } from "./format.js";

const LS_KEYS = {
  transactions: "pkp.transactions.v1",
  categories: "pkp.categories.v1",
  budgets: "pkp.budgets.v1",
  settings: "pkp.settings.v1",
  history: "pkp.history.v1",
};

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Penyimpanan penuh / tidak tersedia: biarkan gagal diam-diam,
    // UI akan menampilkannya lewat pesan error pada aksi yang gagal.
    throw new Error("Gagal menyimpan data. Penyimpanan perangkat penuh atau tidak tersedia.");
  }
}

// ----------------------------------------------------------------------------
// Foto kwitansi (blob) — IndexedDB.
//
// Foto disimpan sebagai data-URL JPEG terkompresi di IndexedDB, TERPISAH dari
// localStorage (yang kapasitasnya kecil) dan dari record transaksi. Record
// transaksi hanya menyimpan photoId (pola yang sama dipakai prototipe
// server: kolom kunci di DB + blob terpisah). Di Fase 2, ganti isi method
// savePhoto/getPhoto/deletePhoto dengan Firebase Storage — signature tetap.
// ----------------------------------------------------------------------------
const PHOTO_DB_NAME = "pkp-photos";
const PHOTO_STORE_NAME = "photos";

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error("Gagal mengakses penyimpanan foto."));
  });
}

class PhotoBlobStore {
  constructor() {
    this._dbPromise = null;
  }

  _db() {
    if (!this._dbPromise) {
      this._dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
          reject(new Error("Penyimpanan foto tidak tersedia di perangkat ini."));
          return;
        }
        const req = indexedDB.open(PHOTO_DB_NAME, 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore(PHOTO_STORE_NAME, { keyPath: "id" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(new Error("Gagal membuka penyimpanan foto."));
      });
    }
    return this._dbPromise;
  }

  async _objectStore(mode) {
    const db = await this._db();
    return db.transaction(PHOTO_STORE_NAME, mode).objectStore(PHOTO_STORE_NAME);
  }

  async save(id, dataUrl) {
    const os = await this._objectStore("readwrite");
    await idbRequest(os.put({ id, dataUrl, createdAt: new Date().toISOString() }));
  }

  async get(id) {
    const os = await this._objectStore("readonly");
    const rec = await idbRequest(os.get(id));
    return rec ? rec.dataUrl : null;
  }

  async delete(id) {
    const os = await this._objectStore("readwrite");
    await idbRequest(os.delete(id));
  }
}

const photoBlobs = new PhotoBlobStore();

// ----------------------------------------------------------------------------
// Riwayat pengeditan (audit log) — append-only.
//
// Setiap pembuatan/pengubahan/penghapusan transaksi menulis satu baris:
//   { id, transactionId, action, transactionMonth, summary,
//     before, after, createdAt }
// Snapshot: { note, type, category (nama), amount, date, has_photo }.
// - created: before = null
// - deleted: after = null ; transactionId tetap terisi walau transaksi hilang
// - Baris riwayat TIDAK ikut terhapus saat transaksi dihapus.
// - transactionMonth diambil dari TANGGAL TRANSAKSI (bukan waktu aksi):
//   update memakai tanggal baru, delete memakai tanggal transaksi yang dihapus.
// ----------------------------------------------------------------------------
function snapshotOf(tx, categoryName) {
  return {
    note: tx.note || "",
    type: tx.type,
    category: categoryName || "Lainnya",
    amount: tx.amount,
    date: tx.date,
    has_photo: !!tx.photoId,
  };
}

/** Ringkasan siap tampil: "{catatan} · {kategori} · {Rp penuh}". */
function summarizeSnapshot(snap) {
  const title = snap.note || snap.category;
  return `${title} · ${snap.category} · ${formatIDR(snap.amount)}`;
}

// Kategori bawaan — Bahasa Indonesia, ikon emoji, warna berbeda per kategori.
const DEFAULT_CATEGORIES = [
  { id: "cat-gaji",        name: "Gaji",        icon: "💼", color: "#22c55e", type: "pemasukan" },
  { id: "cat-bonus",       name: "Bonus",       icon: "🎁", color: "#84cc16", type: "pemasukan" },
  { id: "cat-makanan",     name: "Makanan",     icon: "🍽️", color: "#f59e0b", type: "pengeluaran" },
  { id: "cat-transportasi", name: "Transportasi", icon: "🛵", color: "#3b82f6", type: "pengeluaran" },
  { id: "cat-belanja",     name: "Belanja",     icon: "🛍️", color: "#ec4899", type: "pengeluaran" },
  { id: "cat-tagihan",     name: "Tagihan",     icon: "🧾", color: "#8b5cf6", type: "pengeluaran" },
  { id: "cat-hiburan",     name: "Hiburan",     icon: "🎬", color: "#a855f7", type: "pengeluaran" },
  { id: "cat-kesehatan",   name: "Kesehatan",   icon: "💊", color: "#ef4444", type: "pengeluaran" },
  { id: "cat-pendidikan",  name: "Pendidikan",  icon: "📚", color: "#14b8a6", type: "pengeluaran" },
  { id: "cat-investasi",   name: "Investasi",   icon: "📈", color: "#0ea5e9", type: "pengeluaran" },
  { id: "cat-lainnya",     name: "Lainnya",     icon: "📦", color: "#6b7280", type: "keduanya" },
];

const DEFAULT_SETTINGS = { theme: "auto" }; // auto | light | dark

function validateTransaction(tx) {
  if (tx.type !== "pemasukan" && tx.type !== "pengeluaran") {
    throw new Error("Tipe transaksi harus 'pemasukan' atau 'pengeluaran'.");
  }
  const amount = Math.round(Number(tx.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Jumlah harus berupa angka lebih dari 0.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tx.date || "")) {
    throw new Error("Tanggal tidak valid (format YYYY-MM-DD).");
  }
  return { ...tx, amount };
}

class LocalStorageStore {
  // -- Transaksi -----------------------------------------------------------
  async listTransactions() {
    const rows = read(LS_KEYS.transactions, []);
    return rows.slice().sort((a, b) => (b.date + (b.createdAt || "")).localeCompare(a.date + (a.createdAt || "")));
  }

  async getTransaction(id) {
    const rows = read(LS_KEYS.transactions, []);
    return rows.find((t) => t.id === id) || null;
  }

  async addTransaction(tx) {
    const clean = validateTransaction(tx);
    const rows = read(LS_KEYS.transactions, []);
    const row = { id: uid(), createdAt: new Date().toISOString(), note: "", categoryId: "cat-lainnya", photoId: null, ...clean };
    rows.push(row);
    write(LS_KEYS.transactions, rows);
    const cats = await this.listCategories();
    const after = snapshotOf(row, cats.find((c) => c.id === row.categoryId)?.name);
    this._appendHistory({ transactionId: row.id, action: "created", month: row.date.slice(0, 7), before: null, after });
    return row;
  }

  async updateTransaction(id, patch) {
    const rows = read(LS_KEYS.transactions, []);
    const i = rows.findIndex((t) => t.id === id);
    if (i === -1) throw new Error("Transaksi tidak ditemukan.");
    const cats = await this.listCategories();
    const catName = (cid) => cats.find((c) => c.id === cid)?.name || "Lainnya";
    const before = snapshotOf(rows[i], catName(rows[i].categoryId));
    const clean = validateTransaction({ ...rows[i], ...patch });
    rows[i] = { ...rows[i], ...clean, id };
    write(LS_KEYS.transactions, rows);
    const after = snapshotOf(rows[i], catName(rows[i].categoryId));
    // Diatribusikan ke bulan TANGGAL BARU transaksi (bukan waktu edit).
    this._appendHistory({ transactionId: id, action: "updated", month: rows[i].date.slice(0, 7), before, after });
    return rows[i];
  }

  async deleteTransaction(id) {
    const rows = read(LS_KEYS.transactions, []);
    const target = rows.find((t) => t.id === id);
    if (target) {
      const cats = await this.listCategories();
      const before = snapshotOf(target, cats.find((c) => c.id === target.categoryId)?.name);
      // Diatribusikan ke bulan tanggal transaksi yang dihapus.
      this._appendHistory({ transactionId: id, action: "deleted", month: target.date.slice(0, 7), before, after: null });
      // Foto kwitansi ikut dibersihkan; riwayat TIDAK ikut dihapus.
      if (target.photoId) {
        try { await this.deletePhoto(target.photoId); } catch { /* abaikan */ }
      }
    }
    write(LS_KEYS.transactions, rows.filter((t) => t.id !== id));
  }

  // -- Foto kwitansi -------------------------------------------------------
  // dataUrl: data-URL JPEG hasil kompresi dari UI. Mengembalikan photoId.
  async savePhoto(dataUrl) {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      throw new Error("Data foto tidak valid.");
    }
    const id = `receipts/${Date.now()}-${uid()}`;
    await photoBlobs.save(id, dataUrl);
    return id;
  }

  /** Mengembalikan data-URL foto, atau null bila tidak ada. */
  async getPhoto(photoId) {
    if (!photoId) return null;
    try {
      return await photoBlobs.get(photoId);
    } catch {
      return null;
    }
  }

  async deletePhoto(photoId) {
    if (!photoId) return;
    try {
      await photoBlobs.delete(photoId);
    } catch { /* foto yang hilang bukan error fatal */ }
  }

  // -- Riwayat pengeditan --------------------------------------------------
  _appendHistory({ transactionId, action, month, before, after }) {
    const rows = read(LS_KEYS.history, []);
    rows.push({
      id: uid(),
      transactionId: transactionId || null,
      action, // 'created' | 'updated' | 'deleted'
      transactionMonth: month, // "YYYY-MM" dari tanggal transaksi
      summary: summarizeSnapshot(after || before),
      before: before || null,
      after: after || null,
      createdAt: new Date().toISOString(),
    });
    write(LS_KEYS.history, rows);
  }

  /** Riwayat bulan "YYYY-MM", terbaru dulu. */
  async listHistory(monthKey) {
    const rows = read(LS_KEYS.history, []);
    return rows
      .filter((h) => h.transactionMonth === monthKey)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "") || (b.id > a.id ? 1 : -1));
  }

  // -- Kategori ------------------------------------------------------------
  async listCategories() {
    let cats = read(LS_KEYS.categories, null);
    if (!cats) {
      cats = DEFAULT_CATEGORIES.map((c) => ({ ...c }));
      write(LS_KEYS.categories, cats);
    }
    return cats;
  }

  async addCategory(cat) {
    if (!cat.name || !cat.name.trim()) throw new Error("Nama kategori wajib diisi.");
    const cats = await this.listCategories();
    const row = {
      id: uid(),
      name: cat.name.trim(),
      icon: cat.icon || "📦",
      color: cat.color || "#6b7280",
      type: ["pemasukan", "pengeluaran", "keduanya"].includes(cat.type) ? cat.type : "keduanya",
    };
    cats.push(row);
    write(LS_KEYS.categories, cats);
    return row;
  }

  async updateCategory(id, patch) {
    const cats = await this.listCategories();
    const i = cats.findIndex((c) => c.id === id);
    if (i === -1) throw new Error("Kategori tidak ditemukan.");
    cats[i] = { ...cats[i], ...patch, id };
    write(LS_KEYS.categories, cats);
    return cats[i];
  }

  async deleteCategory(id) {
    const cats = await this.listCategories();
    if (!cats.some((c) => c.id === id)) throw new Error("Kategori tidak ditemukan.");
    // Transaksi yang memakai kategori ini dipindahkan ke "Lainnya" agar
    // riwayat tidak hilang.
    const rows = read(LS_KEYS.transactions, []);
    let moved = false;
    for (const t of rows) {
      if (t.categoryId === id) { t.categoryId = "cat-lainnya"; moved = true; }
    }
    if (moved) write(LS_KEYS.transactions, rows);
    // Anggaran kategori ini ikut dihapus.
    const budgets = read(LS_KEYS.budgets, {});
    delete budgets[id];
    write(LS_KEYS.budgets, budgets);
    write(LS_KEYS.categories, cats.filter((c) => c.id !== id));
  }

  // -- Anggaran (batas bulanan per kategori pengeluaran) --------------------
  // Disimpan sebagai objek { [categoryId]: limit }.
  async getBudgets() {
    return read(LS_KEYS.budgets, {});
  }

  async setBudget(categoryId, limit) {
    const n = Math.round(Number(limit));
    if (!Number.isFinite(n) || n <= 0) throw new Error("Batas anggaran harus lebih dari 0.");
    const budgets = read(LS_KEYS.budgets, {});
    budgets[categoryId] = n;
    write(LS_KEYS.budgets, budgets);
  }

  async deleteBudget(categoryId) {
    const budgets = read(LS_KEYS.budgets, {});
    delete budgets[categoryId];
    write(LS_KEYS.budgets, budgets);
  }

  // -- Pengaturan ----------------------------------------------------------
  async getSettings() {
    return { ...DEFAULT_SETTINGS, ...read(LS_KEYS.settings, {}) };
  }

  async saveSettings(patch) {
    const next = { ...(await this.getSettings()), ...patch };
    write(LS_KEYS.settings, next);
    return next;
  }
}

export const store = new LocalStorageStore();

// Ekspor kelas untuk pengujian / pemakaian ulang.
export { LocalStorageStore, DEFAULT_SETTINGS };
