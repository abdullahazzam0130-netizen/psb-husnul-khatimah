/* =========================================================================
   PSB AL-MUNAWWARAH — script.js
   Vanilla JavaScript. No framework.
   Mobile-first. Local-first.
   ========================================================================= */

/* ---------------------------- CONFIG ------------------------------------ */
const CONFIG = {
  /* API #1: Registration — handle submit (Sheets + folder creation) & finalize.
     PENTING: URL di bawah HARUS diganti dengan deployment Apps Script MILIK
     Pesantren Mitra Husnul Khatimah sendiri. Ikuti petunjuk di README.md
     bagian "Setup — 2 Apps Script Projects". */
  REGISTRATION_API_URL: "https://script.google.com/macros/s/AKfycbx2OaNZcptM_cF_Mbua_WbvNsp5xPLVfbQD8PGfAFvbiK-byLF3S8avOgOgjwf_U5kY5A/exec",

  /* API #2: Drive — pure file upload. Deploy terpisah, paste URL di sini. */
  DRIVE_API_URL: "https://script.google.com/macros/s/AKfycbzq-_gtxJZ1ug7j68kfbv8nJWcW2ADCflfNmbzxdA_x3xbgfNgikikHW1kiq6qCFy75/exec",

  /* Legacy alias (untuk backward compatibility dengan kode lama) */
  get API_URL() { return this.REGISTRATION_API_URL; },

  APP_VERSION: "3.0-split",
  YEAR: "2027",

  /* Social & admin links */
  WHATSAPP_ADMIN_URL: "https://wa.me/6282126016930",
  WHATSAPP_ADMIN_NUMBER: "0821-2601-6930",
  INSTAGRAM_URL: "https://instagram.com/ponpesmitrahusnulkhatimah",

  /* File limits */
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10 MB

  /* Concurrent upload — jumlah file yang diupload paralel ke Drive API */
  CONCURRENT_UPLOADS: 3,

  /* Per-file upload timeout (ms) — 5 menit per file */
  UPLOAD_TIMEOUT_MS: 5 * 60 * 1000,

  /* Local storage keys — v2 setelah rename ke Mitra Husnul Khatimah
     (bumping key agar draft lama dari versi Al-Munawwarah tidak ke-load
      dan menyebabkan error InvalidStateError pada input file) */
  DRAFT_KEY: "psb_husnul_khatimah_draft_v2",
  STEP_KEY: "psb_husnul_khatimah_step_v2",
  SUBMISSION_KEY: "psb_husnul_khatimah_submission_v2",

  /* Splash duration */
  SPLASH_DURATION: 1400,

  /* IndexedDB */
  DB_NAME: "psb_husnul_khatimah_db",
  DB_VERSION: 1,
  DB_STORE_FILES: "files",
};

/* ---------------------------- STEP DEFINITIONS -------------------------- */
/* NOTE: Pesantren Mitra Husnul Khatimah hanya menerima jenjang SMP.
   Step pemilihan jenjang dihapus; jenjang otomatis = "SMP". */
const STEPS = [
  { id: "santri",    label: "Data Santri",   icon: "user" },
  { id: "ortu",      label: "Orang Tua",     icon: "users" },
  { id: "alamat",    label: "Alamat",        icon: "map-pin" },
  { id: "dokumen",   label: "Dokumen",      icon: "file-text" },
];

/* ---------------------------- DOKUMEN DEFINITIONS ----------------------- */
/* NOTE:
   - ktp_ayah, ktp_ibu, kk, akta boleh PDF ATAU gambar ( JPG / PNG / WEBP ).
   - foto & screenshot wajib gambar. */
const DOKUMEN = [
  { id: "ktp_ayah",  label: "KTP Ayah",                       hint: "Scan KTP Ayah (PDF / JPG / PNG)",       accept: "application/pdf,image/jpeg,image/png,image/webp", icon: "file-text", type: "any" },
  { id: "ktp_ibu",   label: "KTP Ibu",                        hint: "Scan KTP Ibu (PDF / JPG / PNG)",        accept: "application/pdf,image/jpeg,image/png,image/webp", icon: "file-text", type: "any" },
  /* NOTE: Spesifikasi asli menyebut "Scan Kartu Keluarga" dua kali.
     Hanya satu field KK yang disediakan. */
  { id: "kk",        label: "Kartu Keluarga",                 hint: "Scan Kartu Keluarga (PDF / JPG / PNG)", accept: "application/pdf,image/jpeg,image/png,image/webp", icon: "file-text", type: "any" },
  { id: "akta",      label: "Akta Kelahiran",                 hint: "Scan Akta Kelahiran (PDF / JPG / PNG)", accept: "application/pdf,image/jpeg,image/png,image/webp", icon: "file-text", type: "any" },
  { id: "foto",      label: "Foto Calon Santri",              hint: "Foto 3x4. Background merah atau biru (JPG / PNG / WEBP)", accept: "image/jpeg,image/png,image/webp", icon: "image",     type: "image" },
  { id: "instagram", label: "Bukti Follow Instagram Pesantren Mitra Husnul Khatimah", hint: "Screenshot follow IG", accept: "image/jpeg,image/png,image/webp", icon: "camera", type: "image", link: "https://instagram.com/ponpesmitrahusnulkhatimah", linkLabel: "Belum Follow? Klik Disini Untuk mengunjungi Instagram Kami" },
];

/* ---------------------------- STATE ------------------------------------- */
const state = {
  currentStep: 0,
  form: {},
  files: {}, // documentType -> file metadata (fileId, name, size, type)
  submissionId: null,
  isSubmitting: false,
};

/* Form field defaults */
const FORM_DEFAULTS = {
  jenjang: "SMP",  // Fixed — Pesantren Mitra Husnul Khatimah hanya menerima SMP
  nama_lengkap: "",
  tempat_lahir: "",
  jenis_kelamin: "",
  tanggal_lahir: "",
  asal_sekolah: "",
  alamat_asal_sekolah: "",
  nisn: "",
  ayah_nama: "",
  ayah_status: "",
  ayah_pendidikan: "",
  ayah_pekerjaan: "",
  ayah_penghasilan: "",
  ibu_nama: "",
  ibu_status: "",
  ibu_pendidikan: "",
  ibu_pekerjaan: "",
  ibu_penghasilan: "",
  alamat_lengkap: "",
  agree_final: false,
};

/* =========================================================================
   INITIALIZATION
   ========================================================================= */
document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
  hydrateState();
  bindGlobalEvents();
  bindFormEvents();
  buildDokumenCards();
  renderStepDots();

  // Splash sequence
  setTimeout(() => {
    refreshIcons();
  }, 50);

  setTimeout(endSplash, CONFIG.SPLASH_DURATION);

  // Trigger backend auto-setup (lazy) — non-blocking, fire-and-forget.
  // Backend akan membuat sheet PENDAFTAR/DOKUMEN/LOG/CONFIG dan folder tahun
  // bila belum ada. Aman bila API_URL belum di-isi.
  triggerBackendSetup();
}

/**
 * Panggil endpoint GET untuk trigger auto-setup database di backend.
 * Fire-and-forget — tidak menunggu hasil, tidak mengganggu UX.
 */
function triggerBackendSetup() {
  // Trigger GET pada Registration API untuk auto-setup database + folder
  if (!CONFIG.REGISTRATION_API_URL) return;
  fetch(CONFIG.REGISTRATION_API_URL, { method: "GET" })
    .then(() => { /* silent success */ })
    .catch(() => { /* silent — bukan kritikal */ });

  // Drive API stateless — tidak butuh setup, tapi trigger GET untuk warm up
  if (CONFIG.DRIVE_API_URL) {
    fetch(CONFIG.DRIVE_API_URL, { method: "GET" })
      .then(() => {})
      .catch(() => {});
  }
}

function endSplash() {
  const splash = document.getElementById("screen-splash");
  const appRoot = document.getElementById("app-root");

  splash.classList.add("is-fading");
  setTimeout(() => {
    splash.classList.remove("is-active");
    appRoot.hidden = false;

    if (hasDraft()) {
      showModal("modal-draft");
    } else {
      showScreen("screen-welcome");
    }
    refreshIcons();
  }, 480);
}

/* =========================================================================
   STATE HYDRATION & PERSISTENCE
   ========================================================================= */
function hydrateState() {
  // Hydrate form data
  try {
    const draft = JSON.parse(localStorage.getItem(CONFIG.DRAFT_KEY) || "{}");
    state.form = { ...FORM_DEFAULTS, ...draft };
  } catch (e) {
    state.form = { ...FORM_DEFAULTS };
  }

  // Hydrate step
  const step = parseInt(localStorage.getItem(CONFIG.STEP_KEY) || "0", 10);
  state.currentStep = isNaN(step) ? 0 : Math.max(0, Math.min(STEPS.length - 1, step));

  // Hydrate submission id
  state.submissionId = localStorage.getItem(CONFIG.SUBMISSION_KEY) || null;
}

function saveDraft() {
  try {
    localStorage.setItem(CONFIG.DRAFT_KEY, JSON.stringify(state.form));
    localStorage.setItem(CONFIG.STEP_KEY, String(state.currentStep));
    if (state.submissionId) {
      localStorage.setItem(CONFIG.SUBMISSION_KEY, state.submissionId);
    }
  } catch (e) {
    console.warn("Gagal menyimpan draft:", e);
  }
}

function hasDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(CONFIG.DRAFT_KEY) || "{}");
    return Object.keys(draft).length > 0 &&
           draft.nama_lengkap && draft.nama_lengkap.trim().length > 0;
  } catch {
    return false;
  }
}

function clearDraft() {
  localStorage.removeItem(CONFIG.DRAFT_KEY);
  localStorage.removeItem(CONFIG.STEP_KEY);
  localStorage.removeItem(CONFIG.SUBMISSION_KEY);
  clearIndexedDBFiles();
}

function resetState() {
  state.form = { ...FORM_DEFAULTS };
  state.files = {};
  state.currentStep = 0;
  state.submissionId = null;
  state.isSubmitting = false;
}

/* =========================================================================
   INDEXEDDB — FILE STORAGE
   ========================================================================= */
function openDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB tidak didukung"));
      return;
    }
    const req = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(CONFIG.DB_STORE_FILES)) {
        const store = db.createObjectStore(CONFIG.DB_STORE_FILES, { keyPath: "id" });
        store.createIndex("documentType", "documentType", { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function saveFileToIndexedDB(documentType, file) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONFIG.DB_STORE_FILES, "readwrite");
    const store = tx.objectStore(CONFIG.DB_STORE_FILES);

    // Remove existing file for this document type
    const existingReq = store.index("documentType").getAll(documentType);
    existingReq.onsuccess = () => {
      const existing = existingReq.result || [];
      existing.forEach((rec) => store.delete(rec.id));

      // Add new file
      const record = {
        id: `${documentType}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        documentType,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        blob: file,
        createdAt: new Date().toISOString(),
      };
      const addReq = store.add(record);
      addReq.onsuccess = () => resolve(record);
      addReq.onerror = (e) => reject(e.target.error);
    };
    existingReq.onerror = (e) => reject(e.target.error);
  });
}

async function deleteFileFromIndexedDB(documentType) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONFIG.DB_STORE_FILES, "readwrite");
    const store = tx.objectStore(CONFIG.DB_STORE_FILES);
    const idx = store.index("documentType");
    const cursorReq = idx.openCursor(IDBKeyRange.only(documentType));
    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    cursorReq.onerror = (e) => reject(e.target.error);
    tx.oncomplete = () => resolve();
  });
}

async function getFileFromIndexedDB(documentType) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONFIG.DB_STORE_FILES, "readonly");
    const idx = tx.objectStore(CONFIG.DB_STORE_FILES).index("documentType");
    const req = idx.get(documentType);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getAllFiles() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONFIG.DB_STORE_FILES, "readonly");
    const req = tx.objectStore(CONFIG.DB_STORE_FILES).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function clearIndexedDBFiles() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(CONFIG.DB_STORE_FILES, "readwrite");
      tx.objectStore(CONFIG.DB_STORE_FILES).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    console.warn("Gagal clear IndexedDB:", e);
  }
}

/* =========================================================================
   SCREEN MANAGEMENT
   ========================================================================= */
function showScreen(id) {
  // Hide all screens
  document.querySelectorAll(".screen").forEach((s) => {
    s.classList.remove("is-active");
  });

  const target = document.getElementById(id);
  if (target) {
    // Remove hidden attribute (some screens start hidden in HTML)
    target.hidden = false;
    // Force reflow for transition
    void target.offsetWidth;
    target.classList.add("is-active");
    // Scroll to top
    target.scrollTop = 0;
    if (target.querySelector) {
      const cont = target.querySelector(".step-container");
      if (cont) cont.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  refreshIcons();
}

/* =========================================================================
   STEP NAVIGATION
   ========================================================================= */
function goToStep(index) {
  if (index < 0 || index >= STEPS.length) return;

  state.currentStep = index;
  saveDraft();

  // Update visibility
  document.querySelectorAll(".step").forEach((el) => {
    el.classList.remove("is-active");
    el.hidden = true;
  });
  const targetStep = document.querySelector(`.step[data-step="${STEPS[index].id}"]`);
  if (targetStep) {
    targetStep.hidden = false;
    // Force reflow for animation
    void targetStep.offsetWidth;
    targetStep.classList.add("is-active");
  }

  // Update header
  document.getElementById("step-title").textContent = STEPS[index].label;
  document.getElementById("step-counter").textContent = `${index + 1} dari ${STEPS.length}`;

  // Update progress bar
  const progress = ((index + 1) / STEPS.length) * 100;
  document.getElementById("appbar-progress-bar").style.width = `${progress}%`;

  // Update step dots
  renderStepDots();

  // Update action bar
  updateActionBar();

  // Special handling per step
  // (Konfirmasi step removed — langsung submit setelah dokumen)

  // Sync form values to DOM (for back navigation)
  syncFormToDOM();

  // Scroll container to top
  const cont = document.getElementById("step-container");
  if (cont) cont.scrollTop = 0;

  refreshIcons();
}

function renderStepDots() {
  const container = document.getElementById("step-dots");
  container.innerHTML = "";
  STEPS.forEach((step, i) => {
    const dot = document.createElement("div");
    dot.className = "step-dot";
    if (i === state.currentStep) dot.classList.add("is-active");
    else if (i < state.currentStep) dot.classList.add("is-done");
    dot.setAttribute("role", "listitem");
    dot.setAttribute("aria-label", `${step.label} ${i < state.currentStep ? "selesai" : i === state.currentStep ? "aktif" : "belum"}`);
    container.appendChild(dot);
  });
}

function updateActionBar() {
  const prevBtn = document.getElementById("btn-prev");
  const nextBtn = document.getElementById("btn-next");
  const submitBtn = document.getElementById("btn-submit");

  prevBtn.hidden = state.currentStep === 0;
  nextBtn.hidden = state.currentStep === STEPS.length - 1;
  submitBtn.hidden = state.currentStep !== STEPS.length - 1;

  // First step: only "Lanjut" displayed (back to welcome handled by appbar X)
  if (state.currentStep === 0) {
    prevBtn.hidden = true;
  }
}

function nextStep() {
  // Validate current step first
  if (!validateCurrentStep()) {
    // Validation will scroll to error and focus first invalid field
    return;
  }
  goToStep(state.currentStep + 1);
}

function prevStep() {
  if (state.currentStep === 0) return;
  goToStep(state.currentStep - 1);
}

/* =========================================================================
   FORM DATA SYNC (state <-> DOM)
   ========================================================================= */
function syncFormToDOM() {
  // Text inputs, textareas, selects
  document.querySelectorAll("[name]").forEach((el) => {
    const name = el.getAttribute("name");
    if (!state.form.hasOwnProperty(name)) return;

    // NEVER try to set .value on <input type="file"> — browser throws
    // InvalidStateError for security. Skip silently.
    if (el.type === "file") return;

    const val = state.form[name];
    if (el.type === "checkbox") {
      el.checked = !!val;
    } else if (el.type === "radio") {
      el.checked = el.value === val;
    } else {
      if (typeof val === "string") el.value = val;
    }
  });

  // Update card-select visual state for jenjang (legacy, jenjang kini fixed = SMP)
  document.querySelectorAll(".card-select").forEach((card) => {
    const value = card.getAttribute("data-value");
    card.classList.toggle("is-selected", state.form.jenjang === value);
  });

  // Update segment control visual state for jenis kelamin
  document.querySelectorAll(".seg").forEach((seg) => {
    const input = seg.querySelector("input");
    if (input && input.value === state.form.jenis_kelamin) {
      seg.classList.add("is-selected");
    } else {
      seg.classList.remove("is-selected");
    }
  });

  // Update doc card visuals
  Object.keys(state.files).forEach((docType) => {
    updateDocCardAttachedState(docType);
  });

  // Update agree-final checkbox visual + .is-checked class fallback
  const agree = document.getElementById("agree-final");
  if (agree) {
    agree.checked = !!state.form.agree_final;
    const checkLabel = agree.closest(".check-agree");
    if (checkLabel) {
      if (agree.checked) checkLabel.classList.add("is-checked");
      else checkLabel.classList.remove("is-checked");
    }
  }

  // Re-run validation display for filled fields
  document.querySelectorAll(".field-input, .field-textarea, .field-select").forEach((el) => {
    const name = el.getAttribute("name");
    if (name && state.form[name] && state.form[name].toString().trim()) {
      const validate = el.getAttribute("data-validate");
      if (validate) {
        const error = runValidators(validate, state.form[name], el);
        setFieldState(el, error);
      }
    }
  });
}

function setFormValue(name, value) {
  state.form[name] = value;
  saveDraft();
}

/* =========================================================================
   EVENT BINDING
   ========================================================================= */
function bindGlobalEvents() {
  // Welcome -> Start
  document.getElementById("btn-start").addEventListener("click", () => {
    showScreen("screen-form");
    goToStep(state.currentStep); // Apply current step
  });

  // Appbar back button
  document.getElementById("btn-back").addEventListener("click", () => {
    if (state.currentStep === 0) {
      // Go back to welcome
      showScreen("screen-welcome");
    } else {
      prevStep();
    }
  });

  // Appbar exit button
  document.getElementById("btn-exit").addEventListener("click", () => {
    showModal("modal-exit");
  });

  // Exit confirm
  document.getElementById("btn-exit-confirm").addEventListener("click", () => {
    hideModal("modal-exit");
    showScreen("screen-welcome");
  });

  // Action bar
  document.getElementById("btn-next").addEventListener("click", nextStep);
  document.getElementById("btn-prev").addEventListener("click", prevStep);
  document.getElementById("btn-submit").addEventListener("click", onSubmit);

  // Draft recovery modal
  document.getElementById("btn-draft-continue").addEventListener("click", () => {
    hideModal("modal-draft");
    showScreen("screen-form");
    goToStep(state.currentStep);
  });

  document.getElementById("btn-draft-restart").addEventListener("click", () => {
    clearDraft();
    resetState();
    hideModal("modal-draft");
    showScreen("screen-form");
    goToStep(0);
  });

  // Modal close (backdrop)
  document.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", () => {
      hideModal(el.getAttribute("data-close"));
    });
  });

  // Submit retry
  document.getElementById("btn-retry").addEventListener("click", () => {
    showScreen("screen-form");
    goToStep(STEPS.length - 1);
  });

  document.getElementById("btn-back-to-form").addEventListener("click", () => {
    showScreen("screen-form");
    goToStep(STEPS.length - 1);
  });

  // Copy registration number
  document.getElementById("btn-copy-reg").addEventListener("click", async (e) => {
    const num = document.getElementById("success-reg-number").textContent;
    try {
      await navigator.clipboard.writeText(num);
      showToast("Nomor pendaftaran disalin", "check-circle");
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = num;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); showToast("Nomor pendaftaran disalin", "check-circle"); }
      catch { showToast("Gagal menyalin", "alert-circle"); }
      ta.remove();
    }
  });

  // Register again (after success)
  document.getElementById("btn-register-again").addEventListener("click", () => {
    resetState();
    clearDraft();
    showScreen("screen-welcome");
  });
}

function bindFormEvents() {
  // Text/textarea/select changes
  document.addEventListener("input", (e) => {
    const target = e.target;
    const name = target.getAttribute("name");
    if (!name) return;

    if (target.type === "checkbox") {
      setFormValue(name, target.checked);
      // Toggle .is-checked class on label.check-agree sebagai fallback :has()
      const checkLabel = target.closest(".check-agree");
      if (checkLabel) {
        if (target.checked) checkLabel.classList.add("is-checked");
        else checkLabel.classList.remove("is-checked");
      }
    } else if (target.type === "radio") {
      setFormValue(name, target.value);
      // Update segment / card-select visuals
      const seg = target.closest(".seg");
      if (seg) {
        seg.parentElement.querySelectorAll(".seg").forEach((s) => s.classList.remove("is-selected"));
        seg.classList.add("is-selected");
      }
      const cardSel = target.closest(".card-select");
      if (cardSel) {
        cardSel.parentElement.querySelectorAll(".card-select").forEach((c) => c.classList.remove("is-selected"));
        cardSel.classList.add("is-selected");
      }
    } else {
      // NISN — strip non-numeric
      if (["nisn"].includes(name)) {
        const cleaned = target.value.replace(/\D/g, "");
        if (cleaned !== target.value) target.value = cleaned;
        setFormValue(name, cleaned);
      } else {
        setFormValue(name, target.value);
      }
    }

    // Inline validation: only validate if value non-empty OR field has been touched/invalid
    const validators = target.getAttribute("data-validate");
    if (validators) {
      const value = state.form[name];
      const error = runValidators(validators, value, target);
      setFieldState(target, error);
    }

    // Update WhatsApp link template when relevant fields change.
    // NOTE: Link kini di-generate saat success screen tampil, jadi ini noop jika tombol belum ada.
    if (name === "nama_lengkap" || name === "jenjang" ||
        name === "nisn" || name === "alamat_lengkap" ||
        name === "asal_sekolah" || name === "ayah_nama") {
      updateSuccessWhatsAppLink();
    }
  });

  // Validate on blur
  document.addEventListener("blur", (e) => {
    const target = e.target;
    if (!target.classList || !target.classList.contains("field-input")) return;
    const validators = target.getAttribute("data-validate");
    if (!validators) return;
    const name = target.getAttribute("name");
    const value = state.form[name];
    const error = runValidators(validators, value, target);
    setFieldState(target, error);
  }, true);

  // Change events for selects/radios
  document.addEventListener("change", (e) => {
    const target = e.target;
    const name = target.getAttribute("name");
    if (!name) return;
    if (target.type === "radio") {
      setFormValue(name, target.value);
    } else if (target.type === "checkbox") {
      setFormValue(name, target.checked);
      // Toggle .is-checked class on label.check-agree
      const checkLabel = target.closest(".check-agree");
      if (checkLabel) {
        if (target.checked) checkLabel.classList.add("is-checked");
        else checkLabel.classList.remove("is-checked");
      }
    }
    const validators = target.getAttribute("data-validate");
    if (validators) {
      const value = state.form[name];
      const error = runValidators(validators, value, target);
      setFieldState(target, error);
    }
  });

  // Keyboard: Enter on form inputs in last step -> submit
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "textarea") {
      const form = document.getElementById("screen-form");
      if (form.classList.contains("is-active")) {
        e.preventDefault();
        if (state.currentStep === STEPS.length - 1) {
          onSubmit();
        } else {
          nextStep();
        }
      }
    }
  });
}

/* =========================================================================
   VALIDATION
   ========================================================================= */
const VALIDATORS = {
  required: (val) => {
    if (val === false) return "Wajib dicentang";
    if (val === undefined || val === null) return "Wajib diisi";
    const s = String(val).trim();
    if (!s) return "Wajib diisi";
    return null;
  },
  name: (val) => {
    if (!val || !String(val).trim()) return null; // let required handle empty
    if (String(val).trim().length < 3) return "Nama terlalu pendek (min. 3 karakter)";
    return null;
  },
  email: (val) => {
    if (!val || !String(val).trim()) return null;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(String(val).trim())) return "Format email tidak valid";
    return null;
  },
  nik: (val) => {
    if (!val || !String(val).trim()) return null;
    const s = String(val).replace(/\D/g, "");
    if (s.length !== 16) return "NIK harus 16 digit angka";
    return null;
  },
  nisn: (val) => {
    if (!val || !String(val).trim()) return null;
    const s = String(val).replace(/\D/g, "");
    if (s.length < 8 || s.length > 10) return "NISN harus 8-10 digit angka";
    return null;
  },
  kk: (val) => {
    if (!val || !String(val).trim()) return null;
    const s = String(val).replace(/\D/g, "");
    if (s.length !== 16) return "Nomor KK harus 16 digit angka";
    return null;
  },
  phone: (val) => {
    if (!val || !String(val).trim()) return null;
    const s = String(val).replace(/[\s\-+]/g, "");
    if (!/^08\d{8,12}$/.test(s)) return "Nomor WhatsApp tidak valid (contoh: 08123456789)";
    return null;
  },
  age: (val) => {
    if (!val) return null;
    const d = new Date(val);
    if (isNaN(d.getTime())) return "Tanggal tidak valid";
    const age = calcAge(d);
    if (age < 5) return "Usia terlalu muda";
    if (age > 25) return "Usia di atas batas pendaftaran";
    return null;
  },
  waFormat: (val) => {
    if (!val || !String(val).trim()) return null;
    if (!/.+#.+#.+/.test(String(val))) return "Format: Nama # Jenjang # Nomor WA";
    return null;
  },
};

function calcAge(birthDate) {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

function runValidators(validatorsStr, value, el) {
  const validators = validatorsStr.split(",").map((s) => s.trim());
  for (const v of validators) {
    const fn = VALIDATORS[v];
    if (!fn) continue;
    const err = fn(value, el);
    if (err) return err;
  }
  return null;
}

function setFieldState(el, error) {
  const field = el.closest(".field");
  const name = el.getAttribute("name");
  const errEl = field
    ? field.querySelector(`[data-error="${name}"]`)
    : document.querySelector(`[data-error="${name}"]`);

  if (!field && !errEl) return;

  if (error) {
    field && field.classList.add("is-invalid");
    field && field.classList.remove("is-valid");
    if (errEl) {
      errEl.textContent = error;
      errEl.classList.add("is-visible");
    }
  } else {
    const value = state.form[name];
    const hasValue = value === true || (value && String(value).trim());
    if (field && hasValue) {
      field.classList.add("is-valid");
      field.classList.remove("is-invalid");
    } else {
      field && field.classList.remove("is-valid", "is-invalid");
    }
    if (errEl) {
      errEl.textContent = "";
      errEl.classList.remove("is-visible");
    }
  }
}

function validateCurrentStep() {
  const stepId = STEPS[state.currentStep].id;
  const stepEl = document.querySelector(`.step[data-step="${stepId}"]`);
  if (!stepEl) return true;

  // Special case: dokumen
  if (stepId === "dokumen") {
    let firstMissing = null;
    for (const doc of DOKUMEN) {
      if (!state.files[doc.id]) {
        firstMissing = firstMissing || doc.id;
        const card = document.querySelector(`.doc-card[data-doctype="${doc.id}"]`);
        if (card) card.classList.add("is-error");
      } else {
        const card = document.querySelector(`.doc-card[data-doctype="${doc.id}"]`);
        if (card) card.classList.remove("is-error");
      }
    }
    if (firstMissing) {
      const card = document.querySelector(`.doc-card[data-doctype="${firstMissing}"]`);
      if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
      showToast("Lengkapi semua dokumen", "alert-circle");
      return false;
    }
    return true;
  }

  // General: validate all fields with data-validate in this step
  const fields = stepEl.querySelectorAll("[data-validate]");
  let firstInvalid = null;
  fields.forEach((el) => {
    const validators = el.getAttribute("data-validate");
    const name = el.getAttribute("name");
    const value = state.form[name];
    const error = runValidators(validators, value, el);
    setFieldState(el, error);
    if (error && !firstInvalid) {
      firstInvalid = el;
    }
  });

  if (firstInvalid) {
    // Scroll to first invalid field
    const field = firstInvalid.closest(".field");
    if (field) {
      field.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setTimeout(() => {
      try { firstInvalid.focus({ preventScroll: true }); } catch {}
    }, 300);
    return false;
  }

  return true;
}

function finalValidation() {
  // Validate all steps
  for (let i = 0; i < STEPS.length; i++) {
    const stepEl = document.querySelector(`.step[data-step="${STEPS[i].id}"]`);
    if (!stepEl) continue;
    const fields = stepEl.querySelectorAll("[data-validate]");
    for (const el of fields) {
      const validators = el.getAttribute("data-validate");
      const name = el.getAttribute("name");
      const value = state.form[name];
      const error = runValidators(validators, value, el);
      if (error) {
        // Jump to this step
        goToStep(i);
        setTimeout(() => {
          setFieldState(el, error);
          const field = el.closest(".field");
          if (field) field.scrollIntoView({ behavior: "smooth", block: "center" });
          try { el.focus({ preventScroll: true }); } catch {}
        }, 200);
        return false;
      }
    }
    // Special: dokumen (final step sekarang)
    if (STEPS[i].id === "dokumen") {
      for (const doc of DOKUMEN) {
        if (!state.files[doc.id]) {
          goToStep(i);
          showToast("Lengkapi semua dokumen", "alert-circle");
          return false;
        }
      }
    }
  }
  return true;
}

/* =========================================================================
   DOKUMEN CARDS
   ========================================================================= */
function buildDokumenCards() {
  const container = document.getElementById("dokumen-list");
  container.innerHTML = "";

  DOKUMEN.forEach((doc) => {
    const card = document.createElement("div");
    card.className = "doc-card";
    card.setAttribute("data-doctype", doc.id);

    const acceptStr = doc.accept.split(",").join(", ");
    const acceptHint = doc.type === "any"
      ? "PDF / JPG / PNG / WEBP, maks 10 MB"
      : "JPG / PNG / WEBP, maks 10 MB";

    card.innerHTML = `
      <div class="doc-card-header">
        <div class="doc-card-icon"><i data-lucide="${doc.icon}"></i></div>
        <div class="doc-card-info">
          <div class="doc-card-title">${doc.label}</div>
          <div class="doc-card-hint">${doc.hint}</div>
          ${doc.link ? `<a class="doc-card-link" href="${doc.link}" target="_blank" rel="noopener"><i data-lucide="${doc.icon}"></i> ${doc.linkLabel || "Buka link"}</a>` : ""}
        </div>
      </div>
      <div class="doc-card-error" data-error="${doc.id}"></div>
      <label class="doc-attach-zone" tabindex="0">
        <input type="file"
               name="doc_${doc.id}"
               accept="${doc.accept}"
               data-doctype="${doc.id}"
               hidden />
        <div class="doc-attach-zone-icon"><i data-lucide="upload-cloud"></i></div>
        <div class="doc-attach-zone-text">Pilih atau jatuhkan file di sini</div>
        <div class="doc-attach-zone-hint">${acceptHint}</div>
      </label>
      <div class="doc-preview" data-preview="${doc.id}">
        <div class="doc-preview-thumb" data-thumb="${doc.id}"></div>
        <div class="doc-preview-info">
          <div class="doc-preview-name" data-name="${doc.id}"></div>
          <div class="doc-preview-size" data-size="${doc.id}"></div>
        </div>
        <div class="doc-preview-actions">
          <button type="button" class="doc-preview-btn" data-replace="${doc.id}" aria-label="Ganti file"><i data-lucide="refresh-cw"></i></button>
          <button type="button" class="doc-preview-btn is-delete" data-remove="${doc.id}" aria-label="Hapus file"><i data-lucide="trash-2"></i></button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  // Bind file input events
  container.querySelectorAll('input[type="file"]').forEach((input) => {
    input.addEventListener("change", (e) => handleFileSelect(e.target));
  });

  // Drag-and-drop
  container.querySelectorAll(".doc-attach-zone").forEach((zone) => {
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("is-dragover");
    });
    zone.addEventListener("dragleave", () => {
      zone.classList.remove("is-dragover");
    });
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("is-dragover");
      const file = e.dataTransfer.files[0];
      if (file) {
        const input = zone.querySelector('input[type="file"]');
        const docType = input.getAttribute("data-doctype");
        handleFileObject(docType, file);
      }
    });
    // Keyboard for accessibility
    zone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const input = zone.querySelector('input[type="file"]');
        if (input) input.click();
      }
    });
  });

  // Replace / remove buttons
  container.querySelectorAll("[data-replace]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const docType = btn.getAttribute("data-replace");
      const input = container.querySelector(`input[data-doctype="${docType}"]`);
      if (input) input.click();
    });
  });
  container.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const docType = btn.getAttribute("data-remove");
      await removeDocFile(docType);
    });
  });

  refreshIcons();
}

async function handleFileSelect(input) {
  const docType = input.getAttribute("data-doctype");
  const file = input.files[0];
  if (file) {
    await handleFileObject(docType, file);
    // Reset input value so re-selecting same file triggers change
    input.value = "";
  }
}

async function handleFileObject(docType, file) {
  const doc = DOKUMEN.find((d) => d.id === docType);
  if (!doc) return;

  const card = document.querySelector(`.doc-card[data-doctype="${docType}"]`);
  const errEl = card ? card.querySelector(`[data-error="${docType}"]`) : null;

  // Clear previous error
  if (card) card.classList.remove("is-error");
  if (errEl) errEl.textContent = "";

  // Validate size
  if (file.size > CONFIG.MAX_FILE_SIZE) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    const err = `File terlalu besar. Ukuran file kamu ${sizeMB} MB. Maksimal 10 MB.`;
    if (errEl) {
      errEl.textContent = err;
    }
    if (card) card.classList.add("is-error");
    showToast(err, "alert-circle");
    return;
  }

  // Validate MIME
  const allowedTypes = doc.accept.split(",").map((t) => t.trim());
  const actualType = file.type || guessMimeFromName(file.name, doc.type);
  const typeOk = allowedTypes.some((t) => {
    if (!t) return false;
    if (t === actualType) return true;
    // Accept any image/* when an image MIME is allowed
    if (t.startsWith("image/") && actualType.startsWith("image/")) return true;
    // Accept application/pdf explicitly
    if (t === "application/pdf" && actualType === "application/pdf") return true;
    return false;
  });
  if (!typeOk) {
    const err = doc.type === "any"
      ? "Format file tidak valid. Hanya PDF / JPG / PNG / WEBP yang diperbolehkan."
      : "Format file tidak valid. Hanya JPG / PNG / WEBP yang diperbolehkan.";
    if (errEl) errEl.textContent = err;
    if (card) card.classList.add("is-error");
    showToast(err, "alert-circle");
    return;
  }

  // Save to IndexedDB
  try {
    const record = await saveFileToIndexedDB(docType, file);
    state.files[docType] = {
      id: record.id,
      fileName: record.fileName,
      fileSize: record.fileSize,
      mimeType: record.mimeType || actualType,
    };
    saveDraft();
    await renderDocPreview(docType, record);
    if (card) {
      card.classList.add("is-attached");
      card.classList.remove("is-error");
    }
    showToast(`${doc.label} terunggah`, "check-circle");
  } catch (e) {
    console.error(e);
    showToast("Gagal menyimpan file. Coba lagi.", "alert-circle");
  }
}

function guessMimeFromName(name, type) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "";
}

async function renderDocPreview(docType, record) {
  const thumb = document.querySelector(`[data-thumb="${docType}"]`);
  const name = document.querySelector(`[data-name="${docType}"]`);
  const size = document.querySelector(`[data-size="${docType}"]`);
  if (!thumb || !name || !size) return;

  name.textContent = record.fileName;
  size.textContent = formatBytes(record.fileSize);

  // Determine type from mimeType
  const isImage = record.mimeType && record.mimeType.startsWith("image/");
  if (isImage) {
    thumb.innerHTML = "";
    const img = document.createElement("img");
    img.alt = record.fileName;
    img.src = URL.createObjectURL(record.blob);
    img.onload = () => URL.revokeObjectURL(img.src);
    thumb.appendChild(img);
  } else {
    thumb.innerHTML = `<div class="doc-preview-thumb-pdf">PDF</div>`;
  }
}

function updateDocCardAttachedState(docType) {
  const card = document.querySelector(`.doc-card[data-doctype="${docType}"]`);
  if (!card) return;
  if (state.files[docType]) {
    card.classList.add("is-attached");
    // Try to re-render preview from IndexedDB if not yet rendered
    const nameEl = document.querySelector(`[data-name="${docType}"]`);
    if (nameEl && !nameEl.textContent) {
      getFileFromIndexedDB(docType).then((record) => {
        if (record) renderDocPreview(docType, record);
      }).catch(() => {});
    }
  } else {
    card.classList.remove("is-attached");
  }
}

async function removeDocFile(docType) {
  await deleteFileFromIndexedDB(docType);
  delete state.files[docType];
  saveDraft();
  const card = document.querySelector(`.doc-card[data-doctype="${docType}"]`);
  if (card) card.classList.remove("is-attached");
  const thumb = document.querySelector(`[data-thumb="${docType}"]`);
  if (thumb) thumb.innerHTML = "";
  const name = document.querySelector(`[data-name="${docType}"]`);
  if (name) name.textContent = "";
  const size = document.querySelector(`[data-size="${docType}"]`);
  if (size) size.textContent = "";
  showToast("File dihapus", "trash-2");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/* =========================================================================
   WHATSAPP LINK — auto-template untuk tombol Konfirmasi ke Admin di success screen
   ========================================================================= */
function updateSuccessWhatsAppLink(registrationNumber) {
  const link = document.getElementById("btn-group-info");
  if (!link) return;

  // Nomor admin PSB Pesantren Mitra Husnul Khatimah
  const phoneNumber = "6282126016930";

  // Ambil data dari state.form
  const namaSantri = state.form.nama_lengkap || "";
  const nisn = state.form.nisn || "";
  const jenjang = "SMP Mitra Husnul Khatimah";
  const alamat = state.form.alamat_lengkap || "";
  const asalSekolah = state.form.asal_sekolah || "";
  const namaAyah = state.form.ayah_nama || "";
  const regNum = registrationNumber || "";

  const lines = [
    "Assalamu'alaikum Warahmatullahi Wabarakatuh.",
    "",
    "Admin PSB Pesantren Mitra Husnul Khatimah, saya orang tua dari " + namaSantri + " mengonfirmasi bahwa ananda telah mendaftar, berikut rinciannya:",
    "",
    regNum ? "Nomor Pendaftaran : " + regNum : "",
    "Nama : " + namaSantri,
    "NISN : " + nisn,
    "Jenjang : " + jenjang,
    "Alamat : " + alamat,
    "Asal Sekolah : " + asalSekolah,
    "Nama Ayah : " + namaAyah,
    "",
    "Mohon informasi selanjutnya, jazakumullah khairan katsiran.",
    "Wassalamu'alaikum Warahmatullahi Wabarakatuh.",
  ].filter(Boolean);
  const message = lines.join("\n");
  const encoded = encodeURIComponent(message);
  link.href = `https://wa.me/${phoneNumber}?text=${encoded}`;
}

/* Legacy alias — keep agar kode lama tidak error */
function updateWhatsAppLink() {
  return updateSuccessWhatsAppLink();
}

/* =========================================================================
   REVIEW SUMMARY
   ========================================================================= */
function renderReviewSummary() {
  const container = document.getElementById("review-summary");
  if (!container) return;
  container.innerHTML = "";

  const f = state.form;

  // Jenjang (fixed SMP)
  const jenjangLabel = "SMP Mitra Husnul Khatimah";
  container.appendChild(reviewBlock("Jenjang", [
    ["Jenjang", jenjangLabel],
  ]));

  // Data Santri
  container.appendChild(reviewBlock("Data Santri", [
    ["Nama Lengkap", f.nama_lengkap],
    ["Tempat Lahir", f.tempat_lahir],
    ["Jenis Kelamin", f.jenis_kelamin],
    ["Tanggal Lahir", formatDate(f.tanggal_lahir)],
    ["Asal Sekolah", f.asal_sekolah],
    ["NISN", f.nisn],
  ], "santri"));

  // Ayah
  container.appendChild(reviewBlock("Data Ayah", [
    ["Nama", f.ayah_nama],
    ["Status", f.ayah_status],
    ["Pendidikan", f.ayah_pendidikan],
    ["Pekerjaan", f.ayah_pekerjaan],
    ["Penghasilan", f.ayah_penghasilan],
  ], "ortu"));

  // Ibu
  container.appendChild(reviewBlock("Data Ibu", [
    ["Nama", f.ibu_nama],
    ["Status", f.ibu_status],
    ["Pendidikan", f.ibu_pendidikan],
    ["Pekerjaan", f.ibu_pekerjaan],
    ["Penghasilan", f.ibu_penghasilan],
  ], "ortu"));

  // Alamat
  container.appendChild(reviewBlock("Alamat", [
    ["Alamat Lengkap", f.alamat_lengkap],
  ], "alamat"));

  // Dokumen
  const docsHtml = DOKUMEN.map((d) => {
    const has = !!state.files[d.id];
    return `<div class="review-doc ${has ? "" : "is-missing"}">
      ${has ? '<i data-lucide="check-circle-2"></i>' : '<i data-lucide="x-circle"></i>'}
      <span>${d.label}</span>
    </div>`;
  }).join("");
  container.appendChild(reviewBlockHtml("Dokumen", docsHtml, "dokumen"));

  refreshIcons();

  // Bind edit buttons
  container.querySelectorAll(".review-block-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-edit-target");
      const stepIdx = STEPS.findIndex((s) => s.id === target);
      if (stepIdx >= 0) goToStep(stepIdx);
    });
  });
}

function reviewBlock(title, rows, editStepId) {
  const block = document.createElement("div");
  block.className = "review-block";
  const rowsHtml = rows.map(([label, val]) => `
    <div class="review-row">
      <span class="review-row-label">${label}</span>
      <span class="review-row-value">${val || "—"}</span>
    </div>
  `).join("");
  block.innerHTML = `
    <div class="review-block-head">
      <span class="review-block-title">${title}</span>
      ${editStepId ? `<button type="button" class="review-block-edit" data-edit-target="${editStepId}"><i data-lucide="pencil"></i> Ubah</button>` : ""}
    </div>
    ${rowsHtml}
  `;
  return block;
}

function reviewBlockHtml(title, html, editStepId) {
  const block = document.createElement("div");
  block.className = "review-block";
  block.innerHTML = `
    <div class="review-block-head">
      <span class="review-block-title">${title}</span>
      ${editStepId ? `<button type="button" class="review-block-edit" data-edit-target="${editStepId}"><i data-lucide="pencil"></i> Ubah</button>` : ""}
    </div>
    <div class="review-docs">${html}</div>
  `;
  return block;
}

function formatDate(s) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

/* =========================================================================
   SUBMIT
   ========================================================================= */
async function onSubmit() {
  if (state.isSubmitting) return;

  // Final validation
  if (!finalValidation()) return;

  // Check Registration API URL configured
  if (!CONFIG.REGISTRATION_API_URL) {
    showErrorScreen(
      "REGISTRATION_API_URL belum dikonfigurasi di script.js. " +
      "Silakan deploy Apps Script milik Pesantren Mitra Husnul Khatimah " +
      "sesuai petunjuk README.md, lalu tempel URL-nya di CONFIG.REGISTRATION_API_URL."
    );
    return;
  }

  // Check Drive API URL configured
  if (!CONFIG.DRIVE_API_URL) {
    showErrorScreen(
      "DRIVE_API_URL belum dikonfigurasi di script.js. " +
      "Silakan deploy Drive API Apps Script terpisah " +
      "sesuai petunjuk README.md, lalu tempel URL-nya di CONFIG.DRIVE_API_URL."
    );
    return;
  }

  const btn = document.getElementById("btn-submit");
  btn.disabled = true;
  state.isSubmitting = true;

  showScreen("screen-processing");
  setProcessingStep("validate");
  setProcessingTitle("Menyiapkan pendaftaran…");
  setProcessingStatus("Memeriksa data…");

  // Generate submission ID for idempotency
  if (!state.submissionId) {
    state.submissionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    saveDraft();
  }

  const submitStartTime = performance.now();

  try {
    // === Phase 1: Validate ===
    await wait(300);
    setProcessingStep("prepare");
    setProcessingTitle("Mengirim pendaftaran…");
    setProcessingStatus("Menyiapkan dokumen…");

    // === Phase 2: Prepare all files (compress + log sizes) ===
    const allFiles = await getAllFiles();
    const preparedFiles = [];

    for (let i = 0; i < allFiles.length; i++) {
      const fileRec = allFiles[i];
      const doc = DOKUMEN.find((d) => d.id === fileRec.documentType);
      const docLabel = doc ? doc.label : fileRec.documentType;

      const prepared = await prepareFileForUpload(fileRec, docLabel);
      preparedFiles.push({ fileRec, docLabel, ...prepared });
    }

    // Total size summary
    const totalOriginal = preparedFiles.reduce((s, f) => s + f.originalSize, 0);
    const totalCompressed = preparedFiles.reduce((s, f) => s + f.compressedSize, 0);
    const totalBase64 = preparedFiles.reduce((s, f) => s + f.base64Size, 0);
    console.log("%c=== SIZE SUMMARY ===", "color:#0F5132;font-weight:bold");
    console.log(`Total original:   ${formatBytes(totalOriginal)}`);
    console.log(`Total compressed: ${formatBytes(totalCompressed)} (reduction: ${((1 - totalCompressed / totalOriginal) * 100).toFixed(1)}%)`);
    console.log(`Total base64:      ${formatBytes(totalBase64)} (overhead vs compressed: ${((totalBase64 / totalCompressed - 1) * 100).toFixed(1)}%)`);
    console.log(`Files: ${preparedFiles.length}, Concurrency: ${CONFIG.CONCURRENT_UPLOADS}`);

    // === Phase 3: Submit to Registration API (creates folder + Sheets row) ===
    setProcessingStatus("Mengirim data pendaftaran…");
    const formData = buildFormPayload();
    const submitResponse = await callRegistrationApi({
      action: "submit",
      submissionId: state.submissionId,
      form: formData,
    });

    if (!submitResponse.ok) {
      throw new Error(submitResponse.data?.message || "Gagal mengirim data pendaftaran");
    }

    const registrationNumber = submitResponse.data.registrationNumber;
    const folderId = submitResponse.data.folderId;

    if (!folderId) {
      throw new Error("Registration API tidak mengembalikan folderId. Pastikan Registration API versi baru sudah di-deploy.");
    }

    console.log(`[submit] RegistrationNumber: ${registrationNumber}`);
    console.log(`[submit] FolderId: ${folderId}`);

    // === Phase 4: Upload all files CONCURRENTLY to Drive API ===
    setProcessingStep("upload");
    setProcessingStatus(`Mengunggah ${preparedFiles.length} dokumen (${CONFIG.CONCURRENT_UPLOADS} paralel)…`);

    const uploadResults = await uploadFilesConcurrent(
      preparedFiles,
      folderId,
      registrationNumber,
      CONFIG.CONCURRENT_UPLOADS
    );

    // STRICT: bila ada satu file pun yang gagal, seluruh pendaftaran gagal
    const failedUploads = uploadResults.filter((r) => !r.success);
    if (failedUploads.length > 0) {
      const failedNames = failedUploads.map((f) => f.docLabel).join(", ");
      const firstError = failedUploads[0].error || "gagal";
      throw new Error(`Gagal mengunggah ${failedUploads.length} file: ${failedNames}. Sebab: ${firstError}. Klik "Coba Lagi" — file yang sudah berhasil tidak akan duplikat.`);
    }

    // Log upload summary
    const uploadDuration = (performance.now() - submitStartTime) / 1000;
    const totalUploaded = uploadResults.reduce((s, r) => s + (r.base64Size || 0), 0);
    const avgSpeed = totalUploaded / 1024 / uploadDuration;
    console.log(`%c=== UPLOAD DONE ===`, "color:#1F8A5B;font-weight:bold");
    console.log(`Total time: ${uploadDuration.toFixed(1)}s`);
    console.log(`Total uploaded: ${formatBytes(totalUploaded)}`);
    console.log(`Average speed: ${avgSpeed.toFixed(0)} KB/s`);
    console.log(`Skipped (idempotent): ${uploadResults.filter((r) => r.skipped).length} file(s)`);

    // === Phase 5: Finalize via Registration API ===
    setProcessingStep("save");
    setProcessingStatus("Menyimpan data pendaftaran…");
    const finalizeResponse = await callRegistrationApi({
      action: "finalize",
      submissionId: state.submissionId,
      registrationNumber,
    });

    if (!finalizeResponse.ok) {
      throw new Error(finalizeResponse.data?.message || "Gagal menyelesaikan pendaftaran");
    }

    // === Phase 6: Done ===
    setProcessingStep("done");
    setProcessingStatus("Pendaftaran selesai");
    await wait(600);

    showSuccessScreen(finalizeResponse.data);
  } catch (err) {
    console.error("Submit error:", err);
    showErrorScreen(err.message || "Terjadi kesalahan saat mengirim pendaftaran");
  } finally {
    state.isSubmitting = false;
    btn.disabled = false;
  }
}

/**
 * Prepare satu file untuk upload:
 *   - Compress gambar (jika > 500 KB)
 *   - Convert ke base64
 *   - Log size breakdown: original → compressed → base64
 *
 * Return:
 *   { blob, mimeType, base64, base64Size, originalSize, compressedSize, storedFileName }
 */
async function prepareFileForUpload(fileRec, docLabel) {
  const originalSize = fileRec.fileSize;
  let blob = fileRec.blob;
  let mimeType = fileRec.mimeType;
  let compressedSize = originalSize;

  // Compress image bila perlu
  if (fileRec.mimeType && fileRec.mimeType.startsWith("image/")) {
    try {
      const compressed = await compressImage(fileRec.blob, fileRec.mimeType);
      if (compressed) {
        blob = compressed.blob;
        mimeType = compressed.mimeType;
        compressedSize = compressed.blob.size;
      }
    } catch (compressErr) {
      console.warn(`[compress] gagal untuk ${fileRec.fileName}:`, compressErr);
    }
  }

  // Convert ke base64
  const base64 = await blobToBase64(blob);
  const base64Size = base64.length; // ~bytes (1 char = 1 byte in JS string)

  // Build stored filename — pattern: PSB-2027-00001_KTP_Ayah.pdf
  // Tapi kita tidak tahu reg number di sini — biarkan Drive API pakai fileName asli
  // dan Registration API rename nanti via finalize. Untuk sekarang pakai docType-based name.
  const extension = guessExtensionLocal(mimeType);
  const docDef = DOKUMEN.find((d) => d.id === fileRec.documentType);
  const docFileName = docDef ? docDef.id : fileRec.documentType;
  // Gunakan nama sementara — akan di-rename oleh Registration API? Tidak.
  // Sebenarnya: Frontend kasih nama final = "PSB-2027-00001_KTP_Ayah.pdf"
  // Tapi reg number baru diketahui SETELAH submit. Jadi kita perlu rename
  // setelah submit response. Mari pakai reg number di fileName.

  console.log(`%c[file] ${docLabel}`, "color:#0F5132;font-weight:bold");
  console.log(`  original:   ${formatBytes(originalSize)}`);
  console.log(`  compressed: ${formatBytes(compressedSize)}${compressedSize < originalSize ? ` (-${((1 - compressedSize / originalSize) * 100).toFixed(1)}%)` : " (no compression)"}`);
  console.log(`  base64:     ${formatBytes(base64Size)} (+${((base64Size / compressedSize - 1) * 100).toFixed(1)}% overhead)`);
  console.log(`  mime:       ${mimeType}`);
  console.log(`  ext:        ${extension}`);

  return {
    blob,
    mimeType,
    base64,
    base64Size,
    originalSize,
    compressedSize,
    extension,
  };
}

function guessExtensionLocal(mimeType) {
  switch (mimeType) {
    case "application/pdf": return "pdf";
    case "image/jpeg":      return "jpg";
    case "image/png":       return "png";
    case "image/webp":      return "webp";
    default: return "bin";
  }
}

/**
 * Upload multiple files CONCURRENTLY with limited concurrency.
 *
 * @param {Array} preparedFiles - Array of { fileRec, docLabel, base64, mimeType, ... }
 * @param {string} folderId - Drive folder ID (dari Registration API)
 * @param {string} registrationNumber - PSB-2027-00001 (untuk fileName + logging)
 * @param {number} concurrency - Berapa upload berjalan paralel (default 3)
 * @returns {Promise<Array>} - Array of { success, docLabel, skipped, fileId, base64Size, durationMs, speedKBps, error? }
 */
async function uploadFilesConcurrent(preparedFiles, folderId, registrationNumber, concurrency = 3) {
  const results = new Array(preparedFiles.length);
  let nextIndex = 0;
  let completedCount = 0;
  const totalStartTime = performance.now();

  // DOC_FILE_NAMES mapping — sama dengan di Code.gs backend
  const DOC_FILE_NAMES = {
    ktp_ayah:    "KTP_Ayah",
    ktp_ibu:     "KTP_Ibu",
    kk:          "Kartu_Keluarga",
    akta:        "Akta_Kelahiran",
    foto:        "Foto_Santri",
    instagram:   "Bukti_Instagram",
  };

  async function worker(workerId) {
    while (nextIndex < preparedFiles.length) {
      const i = nextIndex++;
      const pf = preparedFiles[i];
      const docType = pf.fileRec.documentType;
      const docLabel = pf.docLabel;
      const storedFileName = `${registrationNumber}_${DOC_FILE_NAMES[docType] || docType}.${pf.extension}`;

      const fileStart = performance.now();

      try {
        const uploadResponse = await callDriveApiWithTimeout({
          action: "upload",
          folderId: folderId,
          registrationNumber: registrationNumber,
          documentType: docType,
          fileName: storedFileName,
          mimeType: pf.mimeType,
          fileData: pf.base64,
        }, CONFIG.UPLOAD_TIMEOUT_MS, docLabel);

        const durationMs = performance.now() - fileStart;
        const speedKBps = pf.base64Size > 0 ? (pf.base64Size / 1024) / (durationMs / 1000) : 0;

        if (!uploadResponse.ok) {
          const reason = uploadResponse.data?.message || "gagal";
          console.error(`%c[upload] ✗ ${docLabel} (worker ${workerId})`, "color:#B3261E;font-weight:bold");
          console.error(`  duration: ${(durationMs / 1000).toFixed(1)}s`);
          console.error(`  error:    ${reason}`);
          results[i] = {
            success: false,
            docLabel,
            docType,
            error: reason,
            base64Size: pf.base64Size,
            durationMs,
          };
        } else {
          const skipped = uploadResponse.data.skipped === true;
          const emoji = skipped ? "⏭" : "✓";
          console.log(`%c[upload] ${emoji} ${docLabel} (worker ${workerId})`, "color:#1F8A5B;font-weight:bold");
          console.log(`  duration:  ${(durationMs / 1000).toFixed(1)}s`);
          console.log(`  size:      ${formatBytes(pf.base64Size)} (base64)`);
          console.log(`  speed:     ${speedKBps.toFixed(0)} KB/s`);
          console.log(`  fileId:    ${uploadResponse.data.fileId}`);
          if (skipped) console.log(`  (file sudah ada — idempotent skip)`);

          results[i] = {
            success: true,
            docLabel,
            docType,
            skipped,
            fileId: uploadResponse.data.fileId,
            fileUrl: uploadResponse.data.fileUrl,
            base64Size: pf.base64Size,
            durationMs,
            speedKBps,
          };
        }
      } catch (err) {
        const durationMs = performance.now() - fileStart;
        console.error(`%c[upload] ✗ ${docLabel} (worker ${workerId}) — EXCEPTION`, "color:#B3261E;font-weight:bold");
        console.error(`  duration: ${(durationMs / 1000).toFixed(1)}s`);
        console.error(`  error:    ${err.message}`);
        results[i] = {
          success: false,
          docLabel,
          docType,
          error: err.message,
          base64Size: pf.base64Size,
          durationMs,
        };
      }

      completedCount++;
      setProcessingStatus(`Mengunggah dokumen… (${completedCount} dari ${preparedFiles.length} selesai)`);
    }
  }

  // Spawn N workers
  const workerCount = Math.min(concurrency, preparedFiles.length);
  const workerPromises = [];
  for (let w = 0; w < workerCount; w++) {
    workerPromises.push(worker(w));
  }
  await Promise.all(workerPromises);

  const totalDuration = (performance.now() - totalStartTime) / 1000;
  console.log(`%c=== CONCURRENT UPLOAD COMPLETE ===`, "color:#0F5132;font-weight:bold");
  console.log(`Total time: ${totalDuration.toFixed(1)}s (with ${workerCount} parallel workers)`);
  console.log(`Sequential estimate: ${results.reduce((s, r) => s + (r.durationMs || 0), 0) / 1000} s`);
  console.log(`Speedup: ${((results.reduce((s, r) => s + (r.durationMs || 0), 0) / 1000) / totalDuration).toFixed(2)}x`);

  return results;
}

/**
 * Call Registration API (API #1)
 */
async function callRegistrationApi(payload) {
  return callApiBase(CONFIG.REGISTRATION_API_URL, payload, 60000); // 60s default
}

/**
 * Call Drive API (API #2) with timeout
 */
async function callDriveApiWithTimeout(payload, timeoutMs, label) {
  return callApiBase(CONFIG.DRIVE_API_URL, payload, timeoutMs, label);
}

/**
 * Base API call function with AbortController timeout.
 * Refactored — both Registration & Drive API use this.
 */
async function callApiBase(url, payload, timeoutMs, label) {
  if (!url) {
    return { ok: false, data: { message: "API URL belum dikonfigurasi" } };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs || 60000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
      signal: controller.signal,
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch { data = { message: text }; }
    return { ok: data.success === true, data };
  } catch (err) {
    if (err.name === "AbortError") {
      const mins = Math.round((timeoutMs || 60000) / 60000);
      return { ok: false, data: { message: `Timeout ${label || "request"} (lebih dari ${mins} menit)` } };
    }
    return { ok: false, data: { message: err.message || "Gagal terhubung ke server" } };
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildFormPayload() {
  const f = state.form;
  return {
    jenjang: "SMP",  // Fixed — Pesantren Mitra Husnul Khatimah hanya menerima SMP
    nama_lengkap: f.nama_lengkap,
    tempat_lahir: f.tempat_lahir,
    jenis_kelamin: f.jenis_kelamin,
    tanggal_lahir: f.tanggal_lahir,
    asal_sekolah: f.asal_sekolah,
    alamat_asal_sekolah: f.alamat_asal_sekolah,
    nisn: f.nisn,
    ayah: {
      nama: f.ayah_nama,
      status: f.ayah_status,
      pendidikan: f.ayah_pendidikan,
      pekerjaan: f.ayah_pekerjaan,
      penghasilan: f.ayah_penghasilan,
    },
    ibu: {
      nama: f.ibu_nama,
      status: f.ibu_status,
      pendidikan: f.ibu_pendidikan,
      pekerjaan: f.ibu_pekerjaan,
      penghasilan: f.ibu_penghasilan,
    },
    alamat_lengkap: f.alamat_lengkap,
    submission_id: state.submissionId,
  };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result is data:application/pdf;base64,XXXX
      const result = reader.result;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.substring(idx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Kompres gambar: max dimensi 1600px, kualitas 0.82 untuk JPEG.
 * Tujuan: kurangi ukuran upload supaya Apps Script tidak timeout.
 * - Bila < 500 KB, lewati (sudah cukup kecil)
 * - Bila PNG dengan transparency, tetap pakai PNG
 * - WEBP dipertahankan
 */
async function compressImage(blob, mimeType) {
  if (!blob || blob.size < 500 * 1024) return null; // < 500 KB, no need

  const MAX_DIM = 1600;
  const QUALITY = 0.82;

  // Buat object URL & load ke Image
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = (e) => reject(e);
      i.src = url;
    });

    // Hitung dimensi baru
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (w > MAX_DIM || h > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }

    // Tentukan output mime — kalau PNG non-transparent tetap PNG, kalau besar konversi ke JPEG
    const isPng = mimeType === "image/png";
    const isWebp = mimeType === "image/webp";
    let outMime = "image/jpeg";
    if (isWebp) outMime = "image/webp";
    else if (isPng) {
      // Cek transparency
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      try {
        const data = ctx.getImageData(0, 0, Math.min(w, 50), Math.min(h, 50)).data;
        let hasAlpha = false;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 250) { hasAlpha = true; break; }
        }
        if (hasAlpha) {
          // PNG transparan, simpan sebagai PNG (tapi tetap resized)
          const pngBlob = await new Promise((res) => canvas.toBlob(res, "image/png"));
          return { blob: pngBlob, mimeType: "image/png" };
        }
      } catch (e) {
        // Security error dari cross-origin — fallback ke JPEG
      }
      // PNG non-transparan → konversi ke JPEG untuk ukuran lebih kecil
      outMime = "image/jpeg";
    }

    // Render ke canvas
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";  // flatten transparent → white for JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    // Export ke blob
    const outBlob = await new Promise((res) => canvas.toBlob(res, outMime, QUALITY));
    if (!outBlob) return null;
    return { blob: outBlob, mimeType: outMime };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------------------------- PROCESSING UI ---------------------------- */
function setProcessingStep(key) {
  const steps = ["validate", "prepare", "upload", "save", "done"];
  const currentIdx = steps.indexOf(key);
  document.querySelectorAll("#processing-steps li").forEach((li) => {
    const liStep = li.getAttribute("data-step");
    const idx = steps.indexOf(liStep);
    li.classList.remove("is-active", "is-done");
    if (idx < currentIdx) li.classList.add("is-done");
    else if (idx === currentIdx) li.classList.add("is-active");
  });
}

function setProcessingTitle(text) {
  const el = document.getElementById("processing-title");
  if (el) el.textContent = text;
}
function setProcessingStatus(text) {
  const el = document.getElementById("processing-status");
  if (el) el.textContent = text;
}

/* ---------------------------- SUCCESS / ERROR -------------------------- */
function showSuccessScreen(data) {
  const regNum = data.registrationNumber || "PSB-XXXX-00000";
  document.getElementById("success-reg-number").textContent = regNum;

  // Setup tombol "Konfirmasi ke Admin" dengan pesan WhatsApp berisi nomor pendaftaran
  updateSuccessWhatsAppLink(regNum);

  // Clear draft only after backend confirmed success
  clearDraft();
  resetState();

  showScreen("screen-success");
  refreshIcons();
}

function showErrorScreen(message) {
  const detail = document.getElementById("error-detail");
  if (message) {
    detail.textContent = message;
    detail.hidden = false;
  } else {
    detail.hidden = true;
  }
  showScreen("screen-error");
  refreshIcons();
}

/* =========================================================================
   MODAL
   ========================================================================= */
function showModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    refreshIcons();
  }
}
function hideModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.hidden = true;
    document.body.style.overflow = "";
  }
}

/* =========================================================================
   TOAST
   ========================================================================= */
let toastTimer = null;
function showToast(message, iconName) {
  const toast = document.getElementById("toast");
  toast.innerHTML = "";
  if (iconName) {
    const iconWrap = document.createElement("span");
    iconWrap.innerHTML = `<i data-lucide="${iconName}"></i>`;
    toast.appendChild(iconWrap);
  }
  const text = document.createElement("span");
  text.textContent = message;
  toast.appendChild(text);
  toast.hidden = false;
  void toast.offsetWidth;
  toast.classList.add("is-visible");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => { toast.hidden = true; }, 280);
  }, 2800);
  refreshIcons();
}

/* =========================================================================
   LUCIDE ICONS REFRESH
   ========================================================================= */
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    try { window.lucide.createIcons(); } catch (e) { /* ignore */ }
  }
}

/* =========================================================================
   UTIL
   ========================================================================= */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* On page hide, ensure draft is saved */
window.addEventListener("pagehide", () => {
  saveDraft();
});
window.addEventListener("beforeunload", () => {
  saveDraft();
});
