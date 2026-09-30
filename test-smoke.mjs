// Smoke test: riwayat pengeditan + foto kwitansi (store.js + format.js).
// Dijalankan dengan: node test-smoke.mjs  (dari root pelacak-keuangan-app)

// --- Stub localStorage ---
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};

// --- Stub IndexedDB in-memory (mendukung pola yang dipakai PhotoBlobStore) ---
function makeFakeIndexedDB() {
  const stores = new Map();
  return {
    open() {
      const req = {};
      setTimeout(() => {
        if (req.onupgradeneeded) {
          req.result = {
            createObjectStore(name) {
              if (!stores.has(name)) stores.set(name, new Map());
            },
          };
          req.onupgradeneeded();
        }
        req.result = {
          transaction(storeName) {
            if (!stores.has(storeName)) stores.set(storeName, new Map());
            const map = stores.get(storeName);
            const wrap = (fn) => {
              const r = {};
              setTimeout(() => {
                try { r.result = fn(); if (r.onsuccess) r.onsuccess(); }
                catch { if (r.onerror) r.onerror(); }
              }, 0);
              return r;
            };
            return {
              objectStore() {
                return {
                  put(rec) { return wrap(() => { map.set(rec.id, rec); }); },
                  get(id) { return wrap(() => map.get(id)); },
                  delete(id) { return wrap(() => { map.delete(id); }); },
                };
              },
            };
          },
        };
        if (req.onsuccess) req.onsuccess();
      }, 0);
      return req;
    },
  };
}
global.indexedDB = makeFakeIndexedDB();

let failures = 0;
function check(cond, label) {
  if (cond) console.log("  ✓ " + label);
  else { failures++; console.log("  ✗ GAGAL: " + label); }
}

const { LocalStorageStore } = await import("./web/js/store.js");
const { formatDateLong, formatHistoryTime, formatIDR } = await import("./web/js/format.js");
const store = new LocalStorageStore();

console.log("== Riwayat: created ==");
const tx = await store.addTransaction({
  type: "pengeluaran", amount: 50000, categoryId: "cat-transportasi",
  date: "2026-09-29", note: "bensin",
});
check(tx.photoId === null, "transaksi baru photoId=null");
let h = await store.listHistory("2026-09");
check(h.length === 1 && h[0].action === "created", "satu entri 'created'");
check(h[0].summary === `bensin · Transportasi · ${formatIDR(50000)}`, "summary: " + h[0].summary);
check(h[0].before === null && h[0].after.amount === 50000, "before=null, after lengkap");
check(h[0].transactionId === tx.id, "transactionId terisi");

console.log("== Riwayat: updated (pindah bulan -> bulan baru) ==");
await store.updateTransaction(tx.id, { amount: 60000, date: "2026-10-02" });
const hSep = await store.listHistory("2026-09");
const hOct = await store.listHistory("2026-10");
check(hSep.length === 1, "September tetap 1 entri (dapat " + hSep.length + ")");
check(hOct.length === 1 && hOct[0].action === "updated", "Oktober dapat entri 'updated'");
check(hOct[0].transactionMonth === "2026-10", "diatribusikan ke bulan tanggal baru");
check(hOct[0].before.amount === 50000 && hOct[0].after.amount === 60000, "before/after amount benar");
check(hOct[0].before.date === "2026-09-29" && hOct[0].after.date === "2026-10-02", "before/after date benar");

console.log("== Riwayat: urutan terbaru dulu ==");
await store.updateTransaction(tx.id, { note: "bensin motor" });
const hOct2 = await store.listHistory("2026-10");
check(hOct2.length === 2 && hOct2[0].after.note === "bensin motor", "entri terbaru di urutan pertama");

console.log("== Foto: save/get/delete ==");
const pid = await store.savePhoto("data:image/jpeg;base64,AAAA");
check(pid.startsWith("receipts/"), "photoId berpola receipts/... : " + pid);
check(await store.getPhoto(pid) === "data:image/jpeg;base64,AAAA", "getPhoto mengembalikan data");
await store.deletePhoto(pid);
check(await store.getPhoto(pid) === null, "deletePhoto menghapus blob");

console.log("== Hapus transaksi: foto dibersihkan, riwayat tetap ==");
const tx2 = await store.addTransaction({
  type: "pengeluaran", amount: 20000, categoryId: "cat-makanan",
  date: "2026-09-15", note: "sarapan",
});
const pid2 = await store.savePhoto("data:image/jpeg;base64,BBBB");
await store.updateTransaction(tx2.id, { photoId: pid2 });
await store.deleteTransaction(tx2.id);
check(await store.getPhoto(pid2) === null, "blob foto ikut terhapus saat transaksi dihapus");
const hSep2 = await store.listHistory("2026-09");
const acts = hSep2.map((x) => x.action);
check(acts.includes("deleted"), "entri 'deleted' tercatat: " + acts.join(","));
const del = hSep2.find((x) => x.action === "deleted");
check(del.after === null && del.before.amount === 20000 && del.before.has_photo === true, "snapshot delete benar");
check(del.summary === `sarapan · Makanan · ${formatIDR(20000)}`, "summary delete: " + del.summary);

console.log("== Format ==");
check(formatDateLong("2026-09-29") === "29 September 2026", "formatDateLong");
check(/^\d{1,2} \w{3}, \d{2}\.\d{2}$/.test(formatHistoryTime(new Date().toISOString())), "formatHistoryTime: " + formatHistoryTime(new Date().toISOString()));

console.log(failures === 0 ? "\nSEMUA SMOKE TEST LOLOS" : `\n${failures} TEST GAGAL`);
process.exit(failures === 0 ? 0 : 1);
