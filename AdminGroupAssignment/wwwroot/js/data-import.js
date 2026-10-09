"use strict";

let importRows = [], importBusy = false;
const importEscape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("importFile"), zone = document.getElementById("importDropZone");
    document.getElementById("chooseImportFile").addEventListener("click", () => input.click());
    document.getElementById("downloadImportTemplate").addEventListener("click", downloadImportTemplate);
    document.getElementById("removeImportFile").addEventListener("click", resetImport);
    document.getElementById("showInvalidOnly").addEventListener("change", renderImportRows);
    document.getElementById("startMemberImport").addEventListener("click", startMemberImport);
    input.addEventListener("change", () => handleImportFile(input.files?.[0]));
    ["dragenter", "dragover"].forEach(name => zone.addEventListener(name, event => { event.preventDefault(); zone.classList.add("dragging"); }));
    ["dragleave", "drop"].forEach(name => zone.addEventListener(name, event => { event.preventDefault(); zone.classList.remove("dragging"); }));
    zone.addEventListener("drop", event => handleImportFile(event.dataTransfer?.files?.[0]));
});

async function handleImportFile(file) {
    hideImportMessage();
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") return showImportMessage("Choose a CSV file.", "error");
    if (file.size > 2 * 1024 * 1024) return showImportMessage("The CSV file must be smaller than 2 MB.", "error");
    try {
        const text = await file.text(), matrix = parseCsv(text);
        if (matrix.length < 2) throw new Error("The CSV must contain a header row and at least one member row.");
        importRows = validateImportRows(matrix);
        document.getElementById("importFileName").textContent = file.name;
        document.getElementById("importFileDetails").textContent = `${formatImportSize(file.size)} · ${importRows.length} data rows`;
        document.getElementById("importFileCard").hidden = false;
        document.getElementById("importResults").hidden = false;
        updateImportSummary(); renderImportRows();
    } catch (error) { resetImport(false); showImportMessage(error.message || "Unable to read this CSV file.", "error"); }
}

function parseCsv(text) {
    const rows = []; let row = [], value = "", quoted = false;
    for (let index = 0; index < text.length; index++) {
        const char = text[index], next = text[index + 1];
        if (char === '"' && quoted && next === '"') { value += '"'; index++; }
        else if (char === '"') quoted = !quoted;
        else if (char === "," && !quoted) { row.push(value); value = ""; }
        else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && next === "\n") index++; row.push(value); if (row.some(cell => cell.trim())) rows.push(row); row = []; value = ""; }
        else value += char;
    }
    row.push(value); if (row.some(cell => cell.trim())) rows.push(row); return rows;
}

function normalizeImportHeader(value) { return String(value || "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]/g, ""); }
function importCell(record, ...names) { for (const name of names) { const key = normalizeImportHeader(name); if (record[key] !== undefined) return String(record[key]).trim(); } return ""; }
function validateImportRows(matrix) {
    const headers = matrix[0].map(normalizeImportHeader), emails = new Set();
    const required = ["name", "email", "phonenumber", "password"];
    const missing = required.filter(key => !headers.includes(key) && !(key === "phonenumber" && headers.includes("phone")));
    if (missing.length) throw new Error(`Missing required columns: ${missing.map(x => x === "phonenumber" ? "PhoneNumber" : x[0].toUpperCase() + x.slice(1)).join(", ")}. Download the template and try again.`);
    return matrix.slice(1).map((cells, index) => {
        const record = {}; headers.forEach((header, column) => { record[header] = cells[column] ?? ""; });
        const data = {
            Name: importCell(record, "Name"), Email: importCell(record, "Email"), PhoneNumber: importCell(record, "PhoneNumber", "Phone"), BirthDate: importCell(record, "BirthDate", "DateOfBirth"), Password: importCell(record, "Password"), Tier: importCell(record, "Tier") || "Bronze", ReferralBy: importCell(record, "ReferralBy") || "N/A", EmailSubcribe: importCell(record, "EmailSubcribe", "EmailSubscribe") || "Yes", NotificationStatus: importCell(record, "NotificationStatus") || "Active", AccountStatus: /^inactive|deactive$/i.test(importCell(record, "AccountStatus", "Status")) ? "Deactive" : "Active"
        };
        const errors = [];
        if (!data.Name) errors.push("Name is required");
        if (!data.Email) errors.push("Email is required"); else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.Email)) errors.push("Invalid email"); else if (emails.has(data.Email.toLowerCase())) errors.push("Duplicate email in file"); else emails.add(data.Email.toLowerCase());
        if (!data.PhoneNumber) errors.push("Phone is required");
        if (!data.Password) errors.push("Password is required");
        if (!/^(Bronze|Silver|Gold|Platinum)$/i.test(data.Tier)) errors.push("Invalid tier");
        if (data.BirthDate && Number.isNaN(new Date(data.BirthDate).getTime())) errors.push("Invalid birth date");
        return { rowNumber: index + 2, data, errors, imported: false, apiError: "" };
    });
}

function updateImportSummary() {
    const valid = importRows.filter(row => !row.errors.length).length, invalid = importRows.length - valid;
    document.getElementById("importTotal").textContent = importRows.length;
    document.getElementById("importValid").textContent = valid;
    document.getElementById("importInvalid").textContent = invalid;
    document.getElementById("importResultText").textContent = `${valid} rows ready · ${invalid} rows need attention`;
    const button = document.getElementById("startMemberImport"); button.disabled = !valid || importBusy; button.querySelector("span").textContent = `Import ${valid} valid member${valid === 1 ? "" : "s"}`;
}

function renderImportRows() {
    const invalidOnly = document.getElementById("showInvalidOnly").checked, rows = invalidOnly ? importRows.filter(row => row.errors.length || row.apiError) : importRows;
    document.getElementById("importTableBody").innerHTML = rows.map(row => {
        const failed = row.errors.length || row.apiError, message = row.apiError || row.errors.join("; ") || (row.imported ? "Imported" : "Ready");
        return `<tr class="${failed ? "invalid" : ""}"><td>${row.rowNumber}</td><td>${importEscape(row.data.Name || "-")}</td><td>${importEscape(row.data.Email || "-")}</td><td>${importEscape(row.data.PhoneNumber || "-")}</td><td>${importEscape(row.data.Tier)}</td><td>${row.data.AccountStatus === "Active" ? "Active" : "Inactive"}</td><td><span class="row-result ${failed ? "invalid" : "valid"}"><i class="bi ${failed ? "bi-exclamation-circle" : row.imported ? "bi-check-circle-fill" : "bi-check-circle"}"></i>${importEscape(message)}</span></td></tr>`;
    }).join("");
}

async function startMemberImport() {
    if (importBusy) return;
    const pending = importRows.filter(row => !row.errors.length && !row.imported);
    if (!pending.length) return showImportMessage("There are no valid rows waiting to be imported.", "error");
    if (!window.confirm(`Create ${pending.length} member account${pending.length === 1 ? "" : "s"} from this CSV file?`)) return;
    importBusy = true; hideImportMessage(); const button = document.getElementById("startMemberImport"), bar = document.getElementById("importProgressBar");
    button.disabled = true; button.querySelector("span").textContent = "Importing..."; document.getElementById("importProgressTrack").hidden = false;
    let completed = 0, created = 0;
    for (const row of pending) {
        document.getElementById("importProgressTitle").textContent = `Importing row ${row.rowNumber}`;
        try {
            const response = await fetch("/Admin/CreateMember", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "X-Requested-With": "XMLHttpRequest" }, body: JSON.stringify(row.data) });
            const result = await readImportJson(response); if (!response.ok || result?.success === false) throw new Error(importApiMessage(result, "API rejected this member.")); row.imported = true; row.apiError = ""; created++;
        } catch (error) { row.apiError = error.message || "Import failed"; }
        completed++; bar.style.width = `${Math.round(completed / pending.length * 100)}%`; document.getElementById("importProgressText").textContent = `${completed} of ${pending.length} processed`; renderImportRows();
    }
    importBusy = false; document.getElementById("importProgressTitle").textContent = "Import complete"; document.getElementById("importProgressText").textContent = `${created} created · ${pending.length - created} failed`;
    showImportMessage(`${created} member${created === 1 ? "" : "s"} created successfully${pending.length - created ? `; ${pending.length - created} rows failed` : ""}.`, pending.length === created ? "success" : "error"); updateImportSummary(); renderImportRows();
}

function downloadImportTemplate() { const rows = [["Name", "Email", "PhoneNumber", "BirthDate", "Password", "Tier", "ReferralBy", "EmailSubcribe", "NotificationStatus", "AccountStatus"], ["Sample Member", "member@example.com", "0123456789", "2000-01-31", "ChangeMe123!", "Bronze", "N/A", "Yes", "Active", "Active"]]; downloadImportCsv(rows, "member-import-template.csv"); }
function downloadImportCsv(rows, name) { const csv = rows.map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n"), link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" })); link.download = name; link.click(); URL.revokeObjectURL(link.href); }
function resetImport(clearMessage = true) { if (importBusy) return; importRows = []; document.getElementById("importFile").value = ""; document.getElementById("importFileCard").hidden = true; document.getElementById("importResults").hidden = true; document.getElementById("showInvalidOnly").checked = false; document.getElementById("importProgressTrack").hidden = true; document.getElementById("importProgressBar").style.width = "0"; if (clearMessage) hideImportMessage(); }
function formatImportSize(bytes) { return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`; }
function showImportMessage(text, type) { const box = document.getElementById("importMessage"); box.textContent = text; box.className = `import-message ${type === "success" ? "success" : ""}`; box.hidden = false; }
function hideImportMessage() { document.getElementById("importMessage").hidden = true; }
async function readImportJson(response) { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return { message: text || `HTTP ${response.status}` }; } }
function importApiMessage(data, fallback) { if (data?.errors) return Object.values(data.errors).flat().join(" "); return data?.message || data?.title || fallback; }
