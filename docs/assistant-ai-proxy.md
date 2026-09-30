# Asisten AI Premium - Proxy Lokal

Proxy ini dipakai untuk eksperimen AI tanpa menaruh API key di `web/index.html` atau APK.

## 1. Buat file `.env.local`

Salin `.env.local.example` menjadi `.env.local`, lalu isi test key baru:

```env
AI_API_KEY=isi_test_key_di_sini
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_MODEL=gpt-4o-mini
ASSISTANT_PROXY_PORT=8787
```

Catatan:
- Jangan pakai live key utama.
- Gunakan test key dengan limit kecil.
- `.env.local` sudah ada di `.gitignore`.

## 2. Jalankan proxy

```bash
npm run assistant:proxy
```

Cek status:

```bash
curl http://localhost:8787/health
```

## 3. Contoh request

```bash
curl -X POST http://localhost:8787/api/assistant \
  -H "Content-Type: application/json" \
  -d "{\"command\":\"masukan makan 20k kemarin\",\"today\":\"2026-10-01\",\"activeMonth\":\"2026-10\"}"
```

Respons yang diharapkan:

```json
{
  "ok": true,
  "result": {
    "action": "transaction",
    "type": "expense",
    "amount": 20000,
    "category": "Makanan",
    "name": "makan",
    "date": "2026-09-30",
    "note": ""
  }
}
```

## Action yang didukung

- `transaction`: membuat transaksi pemasukan/pengeluaran.
- `monthlyBudget`: menetapkan batas bulanan.
- `categoryBudget`: menetapkan batas kategori.

Kalimat yang mengandung `batas`, `anggaran`, `budget`, `limit`, atau `plafon` harus diarahkan ke budget, bukan transaksi.
