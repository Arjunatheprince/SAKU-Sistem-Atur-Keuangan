// Render test: pastikan init()/render() semua view + panel riwayat + thumbnail
// foto tidak melempar error, dan markup yang diharapkan hadir.
// Dijalankan dengan: node test-render.mjs (dari root pelacak-keuangan-app)

// --- Stub localStorage ---
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};

// --- Stub IndexedDB in-memory ---
function makeFakeIndexedDB() {
  const stores = new Map();
  return {
    open() {
      const req = {};
      setTimeout(() => {
        if (req.onupgradeneeded) {
          req.result = { createObjectStore(name) { if (!stores.has(name)) stores.set(name, new Map()); } };
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

// --- Stub DOM minimal ---
function makeEl(id) {
  return {
    id, innerHTML: "", textContent: "", value: "",
    style: {}, dataset: {},
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    _listeners: {},
    _onclick: null,
    set onclick(fn) { this._onclick = fn; },
    get onclick() { return this._onclick; },
    addEventListener(type, fn) { this._listeners[type] = fn; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    focus() {},
  };
}
const els = {};
for (const id of ["view", "monthLabel", "modalRoot", "toastRoot", "fab", "monthPrev", "monthNext", "themeToggle"]) {
  els[id] = makeEl(id);
}
const docListeners = {};
global.document = {
  getElementById(id) { return els[id] || null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return makeEl("tmp"); },
  addEventListener(type, fn) { docListeners[type] = fn; },
  documentElement: { dataset: {} },
};
global.window = {
  matchMedia() { return { matches: false, addEventListener() {} }; },
  addEventListener() {},
};

let failures = 0;
function check(cond, label) {
  if (cond) console.log("  âœ“ " + label);
  else { failures++; console.log("  âœ— GAGAL: " + label); }
}
function clickAction(dataset) {
  const e = { target: { closest: (sel) => (sel === "[data-action]" ? { dataset } : null) } };
  return docListeners.click(e);
}

const { store } = await import("./web/js/store.js");
const { init } = await import("./web/js/ui.js");

// --- Seed data: transaksi + foto + riwayat created/updated/deleted ---
const t1 = await store.addTransaction({ type: "pengeluaran", amount: 50000, categoryId: "cat-transportasi", date: "2026-09-29", note: "bensin" });
const pid = await store.savePhoto("data:image/jpeg;base64,AAAA");
await store.updateTransaction(t1.id, { photoId: pid });
await store.updateTransaction(t1.id, { amount: 60000 }); // Diubah: Jumlah
await store.updateTransaction(t1.id, { note: "bensin" }); // Diubah tanpa perubahan nilai
await store.addTransaction({ type: "pengeluaran", amount: 25000, categoryId: "cat-lainnya", date: "2026-09-30", note: "cadangan" });
await store.setBudget("cat-transportasi", 100000);
const t2 = await store.addTransaction({ type: "pemasukan", amount: 5000000, categoryId: "cat-gaji", date: "2026-09-01", note: "Gaji Bulanan" });
await store.deleteTransaction(t2.id);

console.log("== init + dashboard ==");
await init();
check(els.view.innerHTML.includes("Pelacak") || els.view.innerHTML.length > 100, "dashboard ter-render");

console.log("== navigasi ke Transaksi ==");
await clickAction({ action: "nav", view: "transaksi" });
const html = els.view.innerHTML;
check(html.includes("ðŸ“œ Riwayat pengeditan"), "panel riwayat tampil");
check(html.includes("Dibuat") && html.includes("Diubah") && html.includes("Dihapus"), "label aksi Dibuat/Diubah/Dihapus tampil");
check(html.includes("bensin") && html.includes("Transportasi"), "ringkasan riwayat tampil");
check(html.includes("history-changes"), "daftar perubahan tampil");
check(html.includes("Jumlah:") && html.includes("â†’"), "diff Jumlah lama â†’ baru tampil");
check(html.includes("Disimpan tanpa perubahan nilai."), "pesan tanpa-perubahan tampil");
check(html.includes("Foto bukti:") && html.includes("Tidak ada") && html.includes("â†’") && html.includes("Ada"), "diff foto Tidak ada â†’ Ada tampil");
check(html.includes("receipt-thumb-btn") && html.includes("data-photo-id"), "thumbnail foto di baris transaksi");
check(html.includes("data-action=\"view-photo\""), "aksi view-photo terpasang");
check(html.includes("Belum ada perubahan") === false, "tidak ada empty-state palsu (data ada)");

console.log("== navigasi bulan ==");
const before = els.monthLabel.textContent;
await els.monthPrev._onclick();
check(els.monthLabel.textContent !== before, `bulan bergeser (${before} -> ${els.monthLabel.textContent})`);
check(els.view.innerHTML.includes("ðŸ“œ Riwayat pengeditan"), "panel riwayat tetap tampil setelah pindah bulan");
await els.monthNext._onclick();
await els.monthLabel._onclick(); // kembali ke bulan ini

console.log("== navigasi ke Anggaran ==");
await clickAction({ action: "nav", view: "anggaran" });
check(els.view.innerHTML.includes("Anggaran"), "view anggaran ter-render");
check(els.view.innerHTML.includes("85.000") && els.view.innerHTML.includes("100.000"), "Lainnya tanpa batas ikut total batas bulanan");
check(els.view.innerHTML.includes("Lainnya") && els.view.innerHTML.includes("Belum ada batas"), "Lainnya tampil sebagai kategori belum ditetapkan");

console.log("== kembali ke dashboard ==");
await clickAction({ action: "nav", view: "dashboard" });
check(els.view.innerHTML.length > 100, "dashboard ter-render ulang");

console.log(failures === 0 ? "\nSEMUA RENDER TEST LOLOS" : `\n${failures} TEST GAGAL`);
process.exit(failures === 0 ? 0 : 1);


