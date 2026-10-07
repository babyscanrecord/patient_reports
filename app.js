// =========================================================================
// ⚙️ SUPABASE CONFIGURATION
// =========================================================================
const SUPABASE_URL = "https://xbxlzuptiqyeygwyotqd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhieGx6dXB0aXF5ZXlnd3lvdHFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NDU5MDYsImV4cCI6MjEwNTIyMTkwNn0.PN3p4fhJ9UUPu4xwEJsRyLlYRCZhPiLxz43AABbuxP0";
const SUPABASE_BUCKET = "patient-reports";

// =========================================================================
// 🚀 DIRECT SUPABASE CLIENT (Strict RPC Verification & Zero Scraper Risk)
// =========================================================================
class SupabaseDirectClient {
    constructor(baseUrl, key) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.key = key;
        this.authHeaders = {
            "apikey": this.key,
            "Authorization": `Bearer ${this.key}`
        };
    }

    // Secure Database RPC Call: Only returns rows when ID + First + Last name match exactly within 24h
    async searchPatientReport(fileId, firstName, lastName) {
        const url = `${this.baseUrl}/rest/v1/rpc/search_patient_report`;
        const res = await fetch(url, {
            method: "POST",
            headers: {
                ...this.authHeaders,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                p_file_id: fileId,
                p_first_name: firstName,
                p_last_name: lastName
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || `Database error (HTTP ${res.status})`);
        }
        return await res.json();
    }

    async downloadBlob(bucket, storagePath) {
        const cleanPath = encodeURIComponent(storagePath).replace(/%2F/g, "/");
        const url = `${this.baseUrl}/storage/v1/object/${bucket}/${cleanPath}?t=${Date.now()}`;
        const res = await fetch(url, {
            method: "GET",
            cache: "no-store",
            headers: this.authHeaders
        });

        if (!res.ok) {
            throw new Error(`Could not access file in storage (HTTP ${res.status})`);
        }
        return await res.blob();
    }

    async createSignedUrl(bucket, storagePath, expiresIn = 300) {
        const cleanPath = encodeURIComponent(storagePath).replace(/%2F/g, "/");
        const url = `${this.baseUrl}/storage/v1/object/sign/${bucket}/${cleanPath}`;
        const res = await fetch(url, {
            method: "POST",
            headers: {
                ...this.authHeaders,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ expiresIn })
        });

        if (!res.ok) {
            throw new Error(`Signed URL generation failed (HTTP ${res.status})`);
        }
        const data = await res.json();
        return `${this.baseUrl}/storage/v1${data.signedURL}`;
    }

    getPublicUrl(bucket, storagePath) {
        const cleanPath = encodeURIComponent(storagePath).replace(/%2F/g, "/");
        return `${this.baseUrl}/storage/v1/object/public/${bucket}/${cleanPath}`;
    }
}

const supabase = new SupabaseDirectClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM Elements
const searchCard = document.getElementById("searchCard");
const searchForm = document.getElementById("searchForm");
const fileIdInput = document.getElementById("file_id");
const firstNameInput = document.getElementById("first_name");
const lastNameInput = document.getElementById("last_name");
const searchBtn = document.getElementById("searchBtn");
const searchBtnText = document.getElementById("searchBtnText");
const searchSpinner = document.getElementById("searchSpinner");
const searchIcon = document.getElementById("searchIcon");
const alertBox = document.getElementById("alertBox");
const alertIcon = document.getElementById("alertIcon");
const alertTitle = document.getElementById("alertTitle");
const alertMessage = document.getElementById("alertMessage");

const resultsCard = document.getElementById("resultsCard");
const resPatientName = document.getElementById("resPatientName");
const resFileId = document.getElementById("resFileId");
const reportsList = document.getElementById("reportsList");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const downloadAllMergedPdfBtn = document.getElementById("downloadAllMergedPdfBtn");
const newSearchBtn = document.getElementById("newSearchBtn");

let currentActiveReports = [];

// =========================================================================
// ⚡ POINT 6: LAZY LOAD HEAVY CLIENT LIBRARIES (JSZip & PDF-Lib on Demand)
// =========================================================================
let jszipLoadPromise = null;
function ensureJSZip() {
    if (typeof JSZip !== "undefined") return Promise.resolve();
    if (jszipLoadPromise) return jszipLoadPromise;
    jszipLoadPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
        s.integrity = "sha512-XMVd28F1oH/O71fKEHdDUCZhrP61+LQLxJO16l1PWHv562WSOJVCUOwZNewhJxwtK6UBitAKGoWWNgFtLuvvGg==";
        s.crossOrigin = "anonymous";
        s.onload = () => resolve();
        s.onerror = () => {
            const fallback = document.createElement("script");
            fallback.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
            fallback.onload = () => resolve();
            fallback.onerror = () => reject(new Error("Unable to load ZIP library. Please check your internet connection."));
            document.head.appendChild(fallback);
        };
        document.head.appendChild(s);
    });
    return jszipLoadPromise;
}

let pdflibLoadPromise = null;
function ensurePDFLib() {
    if (typeof PDFLib !== "undefined" || (window.PDFLib && window.PDFLib.PDFDocument)) return Promise.resolve();
    if (pdflibLoadPromise) return pdflibLoadPromise;
    pdflibLoadPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.9/pdf-lib.min.js";
        s.crossOrigin = "anonymous";
        s.onload = () => resolve();
        s.onerror = () => {
            const fallback = document.createElement("script");
            fallback.src = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.9/dist/pdf-lib.min.js";
            fallback.onload = () => resolve();
            fallback.onerror = () => reject(new Error("Unable to load PDF merging library. Please check your internet connection."));
            document.head.appendChild(fallback);
        };
        document.head.appendChild(s);
    });
    return pdflibLoadPromise;
}

// =========================================================================
// 🔒 POINT 9: 5-MINUTE INACTIVITY AUTO-RESET (Patient Privacy Protection)
// =========================================================================
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
let inactivityTimer = null;

function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (resultsCard && !resultsCard.classList.contains("hidden")) {
        inactivityTimer = setTimeout(handleInactivityTimeout, INACTIVITY_TIMEOUT_MS);
    }
}

function handleInactivityTimeout() {
    if (!resultsCard || resultsCard.classList.contains("hidden")) return;
    currentActiveReports = [];
    resPatientName.textContent = "";
    resFileId.textContent = "";
    reportsList.innerHTML = "";
    resultsCard.classList.add("hidden");
    searchCard.classList.remove("hidden");
    searchForm.reset();
    showAlert("Session Expired", "For patient privacy and medical data security, your session was automatically closed after 5 minutes of inactivity.", "amber");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// User activity listeners
['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
    window.addEventListener(evt, resetInactivityTimer, { passive: true });
});

// =========================================================================
// 🔍 SEARCH & VALIDATION LOGIC (Points 7 & 10)
// =========================================================================
function executeSearch(e) {
    if (e && e.preventDefault) {
        e.preventDefault();
    }
    runSearchAsync();
    return false;
}

async function runSearchAsync() {
    alertBox.classList.add("hidden");

    const rawFileId = (fileIdInput.value || "").trim();
    const rawFirstName = (firstNameInput.value || "").trim();
    const rawLastName = (lastNameInput.value || "").trim();

    // Point 10: Strict Client-Side Input Sanitization & Validation
    const file_id = rawFileId.toUpperCase().replace(/[^A-Z0-9\-_]/g, "");
    const first_name = rawFirstName.replace(/[^A-Za-z\s\.\'\-]/g, "").trim();
    const last_name = rawLastName.replace(/[^A-Za-z\s\.\'\-]/g, "").trim();

    if (!file_id || !first_name || !last_name) {
        showAlert("Please enter Patient ID, First Name, and Last Name", "", "red");
        return;
    }

    if (file_id.length > 15 || first_name.length > 40 || last_name.length > 40) {
        showAlert("Input length exceeds allowed limits", "Please double-check your entered Patient ID and Name.", "red");
        return;
    }

    // UI Loading state
    searchBtn.disabled = true;
    searchBtnText.textContent = "Verifying Records...";
    searchSpinner.classList.remove("hidden");
    searchIcon.classList.add("hidden");

    try {
        // 1. Secure RPC function call in Supabase
        const records = await supabase.searchPatientReport(file_id, first_name, last_name);

        if (!records || records.length === 0) {
            showAlert("Report Not Found", "No reports matched the provided Patient ID and Name. Please check spelling or contact clinic.", "red");
            return;
        }

        // 2. Deduplicate scans & image sheets (guarantees latest corrected scan replaces previous upload)
        const uniqueReports = [];
        for (const report of records) {
            let rStudy = (report.study_type || "ULTRASOUND SCAN").trim().toUpperCase();
            if (rStudy === "ULTRASOUND IMAGES") {
                report.study_type = "2D ULTRASOUND IMAGES";
                rStudy = "2D ULTRASOUND IMAGES";
            }

            const existingIdx = uniqueReports.findIndex(item => {
                if (report.storage_path && item.storage_path && report.storage_path === item.storage_path) return true;
                if (report.filename && item.filename && report.filename === item.filename) return true;

                const itemStudy = (item.study_type || "").trim().toUpperCase();
                if (rStudy === itemStudy) return true;

                // 3D/4D multi-sheet normalization check
                const is3d_r = rStudy.includes("3D") || rStudy.includes("4D");
                const is3d_item = itemStudy.includes("3D") || itemStudy.includes("4D");
                if (is3d_r && is3d_item) {
                    const num_r = (rStudy.match(/sheet\s*(\d+)/i) || [])[1] || "1";
                    const num_item = (itemStudy.match(/sheet\s*(\d+)/i) || [])[1] || "1";
                    if (num_r === num_item) return true;
                }

                return false;
            });

            if (existingIdx >= 0) {
                if (new Date(report.created_at) > new Date(uniqueReports[existingIdx].created_at)) {
                    uniqueReports[existingIdx] = report;
                }
            } else {
                uniqueReports.push(report);
            }
        }

        // 3. Sort reports in strict clinical priority order
        uniqueReports.sort(compareReportsByClinicalOrder);

        // 4. Switch to Results View (Hides Search Form completely)
        currentActiveReports = uniqueReports;
        renderResults(records[0], uniqueReports);

    } catch (err) {
        // Point 7: Production error handling without leaking stack traces
        showAlert(
            "Connection Error",
            "Could not connect to report service. Please check your internet connection and try again.",
            "red"
        );
    } finally {
        searchBtn.disabled = false;
        searchBtnText.textContent = "Find Ultrasound Reports";
        searchSpinner.classList.add("hidden");
        searchIcon.classList.remove("hidden");
    }
}

function renderResults(patientInfo, reports) {
    resPatientName.textContent = patientInfo.full_name || `${firstNameInput.value} ${lastNameInput.value}`;
    resFileId.textContent = patientInfo.file_id;
    reportsList.innerHTML = "";

    if (reports.length > 1) {
        downloadAllBtn.classList.remove("hidden");
        downloadAllMergedPdfBtn.classList.remove("hidden");
    } else {
        downloadAllBtn.classList.add("hidden");
        downloadAllMergedPdfBtn.classList.add("hidden");
    }

    reports.forEach((report, index) => {
        const card = document.createElement("div");
        card.className = "flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-babyscan-300 transition-all";
        
        const btnId = `dl-btn-${index}`;
        card.innerHTML = `
            <div class="flex items-center space-x-3.5">
                <div class="p-3 bg-babyscan-100 text-babyscan-700 rounded-xl">
                    <i class="fa-solid fa-file-pdf text-xl"></i>
                </div>
                <div>
                    <h4 class="font-bold text-sm text-slate-800">${escapeHTML(report.study_type || "Ultrasound Scan")}</h4>
                    <p class="text-xs text-slate-500">${report.visit_date ? "Date: " + escapeHTML(report.visit_date) : "Ultrasound Scan"}</p>
                </div>
            </div>
            <button 
                type="button" 
                id="${btnId}"
                class="btn-babyscan text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm hover:shadow transition-all flex items-center space-x-1.5 cursor-pointer"
            >
                <i class="fa-solid fa-download"></i>
                <span>Download</span>
            </button>
        `;

        const btn = card.querySelector(`#${btnId}`);
        if (btn) {
            btn.addEventListener("click", () => {
                downloadSingleReport(report.storage_path, report.filename, btnId);
            });
        }

        reportsList.appendChild(card);
    });

    // Smooth transition: Hide search form card, display download card
    searchCard.classList.add("hidden");
    resultsCard.classList.remove("hidden");
    resetInactivityTimer();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function downloadSingleReport(storagePath, filename, btnId) {
    resetInactivityTimer();
    const btn = document.getElementById(btnId);
    const originalHTML = btn ? btn.innerHTML : "";
    if (btn) {
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Downloading...`;
        btn.disabled = true;
    }

    try {
        // Method 1: Download directly as Blob (100% reliable across desktop & mobile)
        const blob = await supabase.downloadBlob(SUPABASE_BUCKET, storagePath);
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = blobUrl;
        a.download = filename || "ultrasound_report.pdf";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            a.remove();
            window.URL.revokeObjectURL(blobUrl);
        }, 2000);

    } catch (err) {
        try {
            // Method 2 (Fallback): Signed URL
            const signedUrl = await supabase.createSignedUrl(SUPABASE_BUCKET, storagePath, 300);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = signedUrl;
            a.download = filename || "ultrasound_report.pdf";
            a.target = "_blank";
            document.body.appendChild(a);
            a.click();
            setTimeout(() => a.remove(), 2000);
        } catch (fallbackErr) {
            const publicUrl = supabase.getPublicUrl(SUPABASE_BUCKET, storagePath);
            window.open(publicUrl, "_blank");
        }
    } finally {
        if (btn) {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }
}

// Download All as ZIP (Lazy-loads JSZip)
downloadAllBtn.addEventListener("click", async function() {
    resetInactivityTimer();
    if (!currentActiveReports || currentActiveReports.length === 0) return;

    downloadAllBtn.disabled = true;
    downloadAllBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Zipping...`;

    try {
        await ensureJSZip();
        const zip = new JSZip();

        const fetchPromises = currentActiveReports.map(async (report) => {
            try {
                const blob = await supabase.downloadBlob(SUPABASE_BUCKET, report.storage_path);
                const fname = report.filename || `${report.study_type}.pdf`;
                return { fname, blob };
            } catch (e) {
                return null;
            }
        });

        const fetchedFiles = await Promise.all(fetchPromises);
        let addedCount = 0;
        for (const file of fetchedFiles) {
            if (file) {
                zip.file(file.fname, file.blob);
                addedCount++;
            }
        }

        if (addedCount === 0) {
            throw new Error("Could not download report files from cloud storage.");
        }

        const content = await zip.generateAsync({ type: "blob" });
        const url = window.URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${resFileId.textContent}_All_Reports.zip`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            a.remove();
            window.URL.revokeObjectURL(url);
        }, 2000);

    } catch (err) {
        alert("Failed to create ZIP: " + (err.message || "Please check your network."));
    } finally {
        downloadAllBtn.disabled = false;
        downloadAllBtn.innerHTML = `<i class="fa-solid fa-file-zipper"></i> <span>Download All as ZIP</span>`;
    }
});

// Download All as Merged PDF (Checks pre-merged cloud file or lazy-loads PDF-Lib)
downloadAllMergedPdfBtn.addEventListener("click", async function() {
    resetInactivityTimer();
    if (!currentActiveReports || currentActiveReports.length === 0) return;

    const fileId = resFileId.textContent.trim() || "REPORT";
    const patientName = (resPatientName.textContent.trim() || "Patient").replace(/[^a-zA-Z0-9]/g, '_');
    const sortedReports = [...currentActiveReports].sort(compareReportsByClinicalOrder);

    downloadAllMergedPdfBtn.disabled = true;
    downloadAllMergedPdfBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Preparing PDF...`;

    try {
        let downloadBlobObj = null;
        const targetFileName = `${fileId}_${patientName}_Complete_Report.pdf`;

        // 1. Check if Supabase Storage has pre-merged cloud file from folder_watcher
        if (fileId && fileId !== "REPORT") {
            try {
                const preMergedBlob = await supabase.downloadBlob(SUPABASE_BUCKET, `reports/${fileId}_COMPLETE_REPORT.pdf`);
                if (preMergedBlob && preMergedBlob.size > 1000) {
                    downloadBlobObj = preMergedBlob;
                }
            } catch (preErr) {
                // Pre-merged file optional; fallback to client-side merge below
            }
        }

        // 2. Client-side fallback if pre-merged file is not yet available in storage
        if (!downloadBlobObj) {
            await ensurePDFLib();
            const PDFLibObj = window.PDFLib || (typeof PDFLib !== "undefined" ? PDFLib : null);
            if (!PDFLibObj || !PDFLibObj.PDFDocument) {
                throw new Error("PDF processing engine is initializing. Please download individual scans or try again.");
            }

            const fetchPromises = sortedReports.map(async (report) => {
                if (!report.storage_path) return null;
                try {
                    const blob = await supabase.downloadBlob(SUPABASE_BUCKET, report.storage_path);
                    return await blob.arrayBuffer();
                } catch (e) {
                    return null;
                }
            });

            const pdfBuffers = await Promise.all(fetchPromises);
            const validBuffers = pdfBuffers.filter(b => b !== null && b.byteLength > 0);

            if (validBuffers.length === 0) {
                throw new Error("No PDF scans could be downloaded from storage.");
            }

            if (validBuffers.length === 1) {
                downloadBlobObj = new Blob([validBuffers[0]], { type: "application/pdf" });
            } else {
                const mergedDoc = await PDFLibObj.PDFDocument.create();
                let totalPages = 0;

                for (const buf of validBuffers) {
                    try {
                        const srcDoc = await PDFLibObj.PDFDocument.load(buf, { ignoreEncryption: true });
                        const pageIndices = srcDoc.getPageIndices();
                        const copiedPages = await mergedDoc.copyPages(srcDoc, pageIndices);
                        copiedPages.forEach(p => mergedDoc.addPage(p));
                        totalPages += copiedPages.length;
                    } catch (loadErr) {
                        // Skip unreadable document
                    }
                }

                if (totalPages === 0) {
                    throw new Error("Unable to extract pages from the PDF documents.");
                }

                const mergedBytes = await mergedDoc.save();
                downloadBlobObj = new Blob([mergedBytes], { type: "application/pdf" });
            }
        }

        // 3. Trigger direct browser download (Universal across iOS Safari, Android Chrome & Desktop)
        const url = window.URL.createObjectURL(downloadBlobObj);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = targetFileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            a.remove();
            window.URL.revokeObjectURL(url);
        }, 2000);

    } catch (err) {
        alert("Failed to download merged PDF: " + (err.message || "Unknown error"));
    } finally {
        downloadAllMergedPdfBtn.disabled = false;
        downloadAllMergedPdfBtn.innerHTML = `<i class="fa-solid fa-file-pdf"></i> <span>Download all as merged PDF</span>`;
    }
});

// Switch back to Search View
newSearchBtn.addEventListener("click", function() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    currentActiveReports = [];
    resultsCard.classList.add("hidden");
    searchCard.classList.remove("hidden");
    searchForm.reset();
    alertBox.classList.add("hidden");
    fileIdInput.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
});

// Form submission & input formatting event listeners
searchForm.addEventListener("submit", executeSearch);
searchBtn.addEventListener("click", executeSearch);

fileIdInput.addEventListener("input", function() {
    this.value = this.value.toUpperCase().replace(/[^A-Z0-9\-_]/g, '');
});

firstNameInput.addEventListener("input", function() {
    this.value = this.value.replace(/[^A-Za-z\s\.\'\-]/g, '');
});

lastNameInput.addEventListener("input", function() {
    this.value = this.value.replace(/[^A-Za-z\s\.\'\-]/g, '');
});

function showAlert(title, message = "", type = "red") {
    alertBox.classList.remove("hidden");
    if (type === "amber") {
        alertBox.className = "p-4 rounded-2xl flex items-center space-x-3 text-sm bg-amber-50 text-amber-900 border border-amber-200";
        alertIcon.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-amber-600"></i>`;
    } else {
        alertBox.className = "p-4 rounded-2xl flex items-center space-x-3 text-sm bg-red-50 text-red-900 border border-red-200";
        alertIcon.innerHTML = `<i class="fa-solid fa-circle-exclamation text-red-600"></i>`;
    }
    alertTitle.textContent = title;
    if (message) {
        alertMessage.textContent = message;
        alertMessage.classList.remove("hidden");
    } else {
        alertMessage.textContent = "";
        alertMessage.classList.add("hidden");
    }
    alertBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Clinical Priority Sorting Helpers:
// 1st: Diagnostic Scans (Target / NT / Early Target / 3rd Trimester / 2nd Opinion / Pelvic)
// 2nd: Echocardiography
// 3rd: Doppler
// 4th: Growth Graph / Charts
// 5th: 3D/4D Images (Sheet 1, Sheet 2...)
// 6th: 2D Images
function getReportSortRank(studyType, filename = "") {
    const s = ((studyType || "") + " " + (filename || "")).toUpperCase();

    // 2nd: Echocardiography (checked first because cardiography contains 'graph')
    if (s.includes("ECHO")) return 200;

    // 3rd: Doppler Studies
    if (s.includes("DOPPLER")) return 300;

    // 4th: Growth Graph & Charts
    if ((s.includes("GROWTH") && (s.includes("GRAPH") || s.includes("CHART") || s.includes("CURVE"))) ||
        s.includes("CHART") || s.includes("GRAPH") || s.includes("CURVE")) {
        return 400;
    }

    // 5th: 3D Images All Sheets
    if (s.includes("3D") || s.includes("4D")) {
        const sheetMatch = s.match(/SHEET\s*(\d+)/i) || s.match(/(\d+)/);
        const sheetNum = sheetMatch ? parseInt(sheetMatch[1], 10) : 1;
        return 500 + Math.min(sheetNum, 99);
    }

    // 6th: 2D Images All Sheets (FET A before FET B)
    if (s.includes("2D") || s.includes("IMAGE") || s.includes("PHOTO")) {
        if (s.includes("FET A") || s.includes("TWIN A")) return 600;
        if (s.includes("FET B") || s.includes("TWIN B")) return 601;
        const sheetMatch = s.match(/SHEET\s*(\d+)/i) || s.match(/(\d+)/);
        const sheetNum = sheetMatch ? parseInt(sheetMatch[1], 10) : 1;
        return 600 + Math.min(sheetNum, 99);
    }

    // 1st: Primary Diagnostic Scans (Rank 100-199)
    if (s.includes("EARLY TARGET") || s.includes("EARLY ANOMALY")) return 130;
    if (s.includes("TARGET") || s.includes("ANOMALY") || s.includes("LEVEL 2") || s.includes("LEVEL-2")) return 110;
    if (s.includes("NT") || s.includes("NB") || s.includes("FIRST TRIMESTER") || s.includes("1ST TRIMESTER")) return 120;
    if (s.includes("3RD TRIMESTER") || s.includes("THIRD TRIMESTER") || s.includes("GROWTH SCAN")) return 140;
    if (s.includes("2ND OPINION") || s.includes("SECOND OPINION")) return 150;
    if (s.includes("EARLY") || s.includes("VIABILITY") || s.includes("DATING")) return 160;
    if (s.includes("PELVIC") || s.includes("PELVIS")) return 170;
    if (s.includes("FOLLICULAR")) return 180;

    return 190;
}

function compareReportsByClinicalOrder(a, b) {
    const rankA = getReportSortRank(a.study_type, a.filename);
    const rankB = getReportSortRank(b.study_type, b.filename);
    if (rankA !== rankB) return rankA - rankB;
    const dateA = a.created_at || "";
    const dateB = b.created_at || "";
    return dateB.localeCompare(dateA);
}

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>"']/g, 
        tag => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[tag] || tag)
    );
}
