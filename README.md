# PSB — Pesantren Mitra Husnul Khatimah Tanjungsari, Sumedang
### Portal Pendaftaran Santri Baru (Mobile-First) — v3.1 (SMP Only)

Aplikasi web pendaftaran santri baru berbasis **HTML + CSS + Vanilla JavaScript**
(frontend) dan **2 Google Apps Script terpisah** (backend).

---

## Arsitektur v3.0 — Split API

```
                    USER
                     │
                     ▼
              NETLIFY WEBSITE
                     │
            ┌────────┴────────┐
            │                 │
            ▼                 ▼
     REGISTRATION API      DRIVE API
     (Apps Script #1)     (Apps Script #2)
            │                 │
            ▼                 ▼
       GOOGLE SHEETS      GOOGLE DRIVE
       (Database)         (File Storage)
            │                 │
            └────────┬────────┘
                     │
                     ▼
                  FINALIZE
                     │
                     ▼
              STATUS COMPLETE
                     │
                     ▼
                SUCCESS → GRUP INFO
```

### API #1: Registration (`apps-script/registration/Code.gs`)
- **Tugas:** validasi data, generate Registration Number, buat folder Drive, simpan Sheets row, verify folder contents saat finalize
- **Endpoints:** `submit`, `finalize`, `status`
- **Stateful:** pakai `PropertiesService` untuk menyimpan Spreadsheet ID & Root Folder ID
- **Resources:** Spreadsheet + Drive folder (auto-create saat setup)

### API #2: Drive (`apps-script/drive/Code.gs`)
- **Tugas:** PURE file upload — terima base64 file, simpan ke Drive folder tertentu, return fileId
- **Endpoints:** `upload`, `createFolder` (utility), `listFiles` (utility)
- **Stateless:** tidak pakai `PropertiesService`, tidak butuh setup
- **Idempotent:** cek existing file by name sebelum create — retry tidak duplikat

---

## Struktur Folder

```
psb/
├── index.html                          # Single-page app
├── style.css                           # Mobile-first styling
├── script.js                           # 2 API URLs, concurrent upload, size tracking
├── netlify.toml                        # Konfigurasi Netlify
├── README.md                           # Dokumen ini
├── assets/
│   └── logo.svg                        # Logo placeholder
└── apps-script/
    ├── registration/
    │   ├── Code.gs                     # API #1 — submit + finalize
    │   └── appsscript.json              # OAuth scopes (spreadsheets, drive, scriptapp)
    └── drive/
        ├── Code.gs                     # API #2 — pure file upload
        └── appsscript.json              # OAuth scopes (drive, scriptapp)
```

---

## Teknologi

| Bagian    | Teknologi                                                |
|-----------|---------------------------------------------------------|
| Frontend  | HTML5, CSS3, Vanilla JavaScript (ES6+)                  |
| Ikon      | Lucide Icons (via CDN)                                   |
| Font      | Plus Jakarta Sans + Amiri via Google Fonts               |
| Backend   | 2 × Google Apps Script (Registration + Drive)            |
| Database  | Google Sheets                                            |
| Storage   | Google Drive                                             |
| Local     | localStorage (data kecil) + IndexedDB (file)             |
| Hosting   | Netlify (static)                                         |

---

## Fitur Utama v3.0

### Frontend
- ✅ Splash + Welcome + Multi-step form (6 langkah)
- ✅ Inline validation + auto-scroll ke error
- ✅ Auto-save draft (localStorage) + IndexedDB untuk file
- ✅ Draft recovery modal
- ✅ File preview + drag-and-drop + click-to-choose
- ✅ **Auto-compress gambar** (max 1600px, JPEG 82% quality) sebelum upload
- ✅ **Concurrent upload** (3 file paralel ke Drive API) — total time berkurang ~3x
- ✅ **Size & timing tracking** lengkap di console (original → compressed → base64 → speed)
- ✅ Strict mode: 1 file gagal → seluruh pendaftaran gagal, draft tetap aman
- ✅ Fullscreen processing screen dengan status jujur
- ✅ Success screen + copy registration number + Grup Info CTA
- ✅ Mobile-first (360–430px), touch-friendly, safe-area aware
- ✅ `prefers-reduced-motion` dihormati

### Registration API (#1)
- ✅ `submit`: validate → generate `PSB-2027-00001` (LockService) → create folder Drive → simpan Sheets row (Status=PENDING_FILES)
- ✅ `finalize`: verify all 8 files in Drive folder → Status=COMPLETE / UPLOAD_INCOMPLETE
- ✅ Idempotency: submissionId → return RegistrationNumber SAMA (tidak buat baru)
- ✅ Auto-create Spreadsheet + Root folder + Year folder (PropertiesService)
- ✅ Backend validation lengkap

### Drive API (#2)
- ✅ `upload`: decode base64 → validate MIME/size → getFolderById → check existing → createFile
- ✅ **STATELESS** — tidak pakai PropertiesService, tidak butuh setup
- ✅ **IDEMPOTENT** — cek file dengan nama sama sebelum create; bila ada → skip
- ✅ **TIDAK ADA `setSharing()`** — ini penyebab utama "Access denied: DriveApp" sebelumnya
- ✅ Error handling jujur — return `success: false` bila gagal, tidak swallow error

---

## Setup — 2 Apps Script Projects

### Step 1 — Setup Registration API (#1)

1. Buka https://script.google.com → **New project**
2. Beri nama project: **`PSB Registration API`**
3. Paste isi file `apps-script/registration/Code.gs`
4. **Project Settings** (⚙️) → centang **"Show appsscript.json manifest file in editor"**
5. Buka `appsscript.json` → paste isi dari `apps-script/registration/appsscript.json`
6. (Opsional) Edit `CONFIG.YEAR` dan `CONFIG.GROUP_INFO_URL` di Code.gs
7. Pilih fungsi **`setup`** dari dropdown → klik **Run**
8. Grant permission (Google minta 3 scopes: spreadsheets, drive, scriptapp)
9. Lihat **Execution log** — akan muncul URL Spreadsheet & Root folder
10. **Deploy → New deployment → Web app**
    - Execute as: **Me**
    - Who has access: **Anyone**
11. Salin **Web App URL** → ini adalah `REGISTRATION_API_URL`

### Step 2 — Setup Drive API (#2)

1. Buka https://script.google.com → **New project** (project BARU, terpisah dari #1)
2. Beri nama project: **`PSB Drive API`**
3. Paste isi file `apps-script/drive/Code.gs`
4. **Project Settings** (⚙️) → centang **"Show appsscript.json manifest file in editor"**
5. Buka `appsscript.json` → paste isi dari `apps-script/drive/appsscript.json`
6. Pilih fungsi **`testDriveAccess`** dari dropdown → klik **Run**
   - Bila berhasil: log muncul "DriveApp access OK"
   - Bila gagal: ikuti petunjuk di log
7. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
8. Salin **Web App URL** → ini adalah `DRIVE_API_URL`

> ⚠️ **PENTING**: Drive API & Registration API adalah 2 project Apps Script terpisah.
> Mereka punya permission OAuth masing-masing. Keduanya harus di-deploy sebagai Web App
> dengan "Execute as: Me" supaya jalan sebagai akun Anda.

### Step 3 — Konfigurasi Frontend

Buka `script.js`, update bagian CONFIG:

```javascript
const CONFIG = {
  REGISTRATION_API_URL: "https://script.google.com/macros/s/AKfyc.../exec",  // dari Step 1
  DRIVE_API_URL: "https://script.google.com/macros/s/AKfyc.../exec",          // dari Step 2
  ...
};
```

### Step 4 — Deploy Frontend ke Netlify

**Cara cepat:**
1. Buka [Netlify Drop](https://app.netlify.com/drop)
2. Drag folder **`psb/`** ke area drop
3. Done

**Cara via Git:**
1. Push folder `psb/` ke repo Git
2. Login Netlify → **Add new site → Import an existing project**
3. Configure:
   - Build command: (kosong)
   - Publish directory: `.`
4. Deploy

---

## Concurrent Upload — Detail

Frontend mengupload 8 file dengan concurrency 3 (default). Contoh timeline:

```
Worker 0: KTP Ayah ──────✓         KTP Ibu ──────────────✓         TikTok ──────────────✓
Worker 1: Foto ──────✓             Akta ────────────✓             YouTube ──────────✓
Worker 2: KK ──────────✓            Instagram ────────✓              (idle)
```

- TikTok yang 96 detik tidak membuat YouTube harus menunggu TikTok selesai
- Bila satu worker selesai lebih cepat, langsung ambil file berikutnya dari queue
- Speedup: ~2.5x–3x dibanding sequential

Untuk mengubah concurrency:
```javascript
const CONFIG = {
  CONCURRENT_UPLOADS: 3,  // ← ubah ke 5 atau 8 untuk paralel maksimal
  ...
};
```

> Catatan: Apps Script Web App memiliki batas concurrent request per user.
> Jangan set lebih dari 5–8 untuk menghindari rate limit.

---

## Size & Timing Diagnostics

Saat submit, buka **DevTools → Console** untuk melihat log lengkap:

```
=== SIZE SUMMARY ===
Total original:   15.32 MB
Total compressed: 2.41 MB (reduction: 84.3%)
Total base64:     3.22 MB (overhead vs compressed: 33.3%)
Files: 8, Concurrency: 3

[submit] RegistrationNumber: PSB-2027-00001
[submit] FolderId: 1aBcDeFgHiJkLmNoPqRsTuVwXyZ

[file] KTP Ayah
  original:   2.40 MB
  compressed: 412 KB (-82.9%)
  base64:     549 KB (+33.3% overhead)
  mime:       image/jpeg
  ext:        jpg

[upload] ✓ KTP Ayah (worker 0)
  duration:  3.2s
  size:      549 KB (base64)
  speed:     172 KB/s
  fileId:    1aBcDeFgHiJkLmNoPqRsTuVwXyZ

[upload] ⏭ Foto Santri (worker 1)
  (file sudah ada — idempotent skip)

=== CONCURRENT UPLOAD COMPLETE ===
Total time: 18.4s (with 3 parallel workers)
Sequential estimate: 47.2 s
Speedup: 2.56x

=== UPLOAD DONE ===
Total time: 19.1s
Total uploaded: 3.22 MB
Average speed: 172 KB/s
Skipped (idempotent): 0 file(s)
```

Dari log ini Anda bisa diagnose bottleneck:
- Bila `compress` lama tapi `upload` cepat → bottleneck di browser
- Bila `upload` lama → bottleneck di network atau Apps Script
- Bila speed < 100 KB/s → koneksi lambat, sarankan user pindah ke WiFi
- Bila ada file skipped → retry terjadi (idempotency bekerja)

---

## Status Tracking

| Status              | Arti                                                        |
|---------------------|-------------------------------------------------------------|
| `PENDING_FILES`     | Submit berhasil, menunggu upload file                       |
| `UPLOAD_INCOMPLETE`  | Finalize dipanggil tapi file di Drive kurang dari 8        |
| `COMPLETE`          | Semua 8 file terupload & finalize berhasil                 |

Cek di sheet `PENDAFTAR` kolom `Status`.

---

## Idempotency & Retry

### Submit ulang (klik "Kirim Pendaftaran" lagi setelah error)
1. Frontend kirim `submissionId` yang SAMA ke Registration API
2. Backend cek `SubmissionId` di sheet PENDAFTAR
3. Bila sudah ada → return `RegistrationNumber` + `FolderId` yang SAMA (tidak buat baru)

### Upload ulang (klik "Coba Lagi" setelah file gagal)
1. Frontend kirim ulang ke Drive API dengan `fileName` yang sama
2. Backend cek `folder.getFilesByName(storedName)`
3. Bila sudah ada → return existing `fileId` (skip, tidak duplikat)
4. Bila belum ada → upload baru

### Hasilnya
- ❌ Tidak ada Registration Number duplikat
- ❌ Tidak ada file duplikat di Drive
- ✅ Retry aman, user-friendly

---

## Maintenance

### Mengganti Logo
Ganti file `assets/logo.svg` dengan logo pondok asli (SVG atau PNG 512×512).

### Mengganti URL Grup WhatsApp
Edit `apps-script/registration/Code.gs` → `CONFIG.GROUP_INFO_URL` → re-deploy.

### Mengganti Tahun Pendaftaran
1. Edit `apps-script/registration/Code.gs` → `CONFIG.YEAR = "2028"`
2. Edit `script.js` → `CONFIG.YEAR = "2028"`
3. Run `setup()` ulang di Registration API (folder tahun baru akan dibuat otomatis)
4. Re-deploy Registration API

### Mengganti Nomor WhatsApp Admin
Edit `script.js` → `CONFIG.WHATSAPP_ADMIN_URL` dan `CONFIG.WHATSAPP_ADMIN_NUMBER`.
Default: `0821-2601-6930` (Admin PSB Pesantren Mitra Husnul Khatimah).

### Catatan v3.1 — Khusus SMP & Tanpa Step Konfirmasi
- Jenjang otomatis = **SMP** (step pemilihan jenjang dihapus)
- Step konfirmasi (review + checkbox persetujuan + tombol WA ke admin) dihapus — setelah upload dokumen selesai, form langsung submit
- Tombol di success screen diubah dari "Gabung Grup Informasi" menjadi **"Konfirmasi ke Admin"** yang langsung membuka WhatsApp ke nomor admin (`0821-2601-6930`) dengan pesan otomatis berisi nomor pendaftaran + data santri

### Catatan v3.2 — Brand icon Lucide & localStorage reset
- Ikon `instagram` (dan brand icon lainnya) **dihapus dari Lucide** karena masalah trademark. Ikon dokumen "Bukti Follow Instagram" sekarang memakai ikon `camera` (screenshot upload).
- Key localStorage & IndexedDB dibump ke `_v2` (`psb_husnul_khatimah_*`) supaya draft lama dari versi Al-Munawwarah tidak ter-load dan menyebabkan error `InvalidStateError` saat `syncFormToDOM()` mencoba set `.value` pada `<input type="file">`.
- `syncFormToDOM()` sekarang **skip eksplisit** input bertipe `file` — tidak akan crash walau ada data stale.
- `REGISTRATION_API_URL` & `DRIVE_API_URL` di-reset ke string kosong. **Anda wajib deploy Apps Script milik sendiri** — URL lama milik Al-Munawwarah sudah tidak bisa dipakai (404).

---

## Troubleshooting

### "REGISTRATION_API_URL belum dikonfigurasi" / "DRIVE_API_URL belum dikonfigurasi"
- **Penyebab:** Anda belum mengganti URL kosong di `script.js` dengan URL deployment Apps Script milik Pesantren Mitra Husnul Khatimah.
- **Solusi:** Ikuti panduan **Setup — 2 Apps Script Projects** di bawah, lalu tempel URL-nya di `CONFIG.REGISTRATION_API_URL` dan `CONFIG.DRIVE_API_URL`.

### "Timeout request (lebih dari 1 menit)" saat submit
- **Penyebab umum #1:** Membuka `index.html` langsung dari `file://` (double-click di File Explorer). Browser memblokir fetch ke Google Apps Script karena `file:` dianggap origin berbeda (CORS).
- **Solusi:** Hosting di Netlify / Vercel / GitHub Pages, atau jalankan server lokal:
  ```bash
  cd psb
  python3 -m http.server 8080
  # buka http://localhost:8080
  ```
- **Penyebab umum #2:** URL Apps Script masih kosong / salah.
- **Solusi:** Pastikan sudah deploy & tempel URL dengan benar.

### "Unsafe attempt to load URL ... 'file:' URLs are treated as unique security origins"
- **Penyebab:** Sama seperti di atas — `index.html` dibuka via `file://`.
- **Solusi:** Hosting via web server (lihat di atas).

### "Access denied: DriveApp"
- **Penyebab:** Scope OAuth Drive belum di-grant
- **Solusi:**
  1. Pastikan `appsscript.json` sudah benar (3 scopes untuk Registration, 2 untuk Drive)
  2. Run fungsi `setup()` (untuk Registration) atau `testDriveAccess()` (untuk Drive)
  3. Grant permission saat diminta
  4. Re-deploy dengan New version

### "DRIVE_API_URL belum dikonfigurasi"
- **Penyebab:** Frontend belum di-update dengan URL Drive API
- **Solusi:** Edit `script.js` → isi `CONFIG.DRIVE_API_URL`

### "FolderId undefined" / "Registration API tidak mengembalikan folderId"
- **Penyebab:** Registration API masih versi lama (belum di-update ke v3.0)
- **Solusi:** Re-paste `apps-script/registration/Code.gs` → re-deploy dengan New version

### Upload stuck / timeout
- **Penyebab:** Koneksi lambat atau file PDF terlalu besar
- **Solusi:**
  - Buka DevTools → Console → cek speed upload
  - Bila speed < 100 KB/s → sarankan user ke WiFi
  - Bila PDF > 5 MB → sarankan compress di [ilovepdf.com](https://www.ilovepdf.com/compress_pdf)

### File duplikat di Drive
- **Tidak mungkin terjadi** — Drive API cek existing file by name sebelum create
- Bila tetap terjadi → pastikan Drive API versi baru sudah di-deploy

---

## FAQ

**Q: Kenapa harus 2 Apps Script terpisah?**  
A: Single Responsibility Principle. Registration API fokus pada data + folder creation. Drive API fokus pada file storage. Memudahkan debugging, scaling, dan maintenance.

**Q: Apakah Drive API butuh Spreadsheet access?**  
A: Tidak. Drive API stateless — tidak ada sheet lookup, tidak ada PropertiesService. Frontend berikan `folderId` langsung.

**Q: Berapa maksimum ukuran file?**  
A: 10 MB per file. Lebih dari itu akan ditolak baik di frontend maupun backend.

**Q: Apakah user perlu login Google?**  
A: Tidak. Kedua Web App di-deploy dengan "Who has access: Anyone".

**Q: Bagaimana cek status pendaftar?**  
A: Buka Google Spreadsheet → sheet `PENDAFTAR` → kolom `Status`. Atau panggil endpoint `status` di Registration API.

---

## Lisensi & Kepemilikan

Aplikasi ini dibuat untuk **Pesantren Mitra Husnul Khatimah Tanjungsari, Sumedang**.
Silakan modifikasi sesuai kebutuhan operasional pondok.
