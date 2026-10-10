"use strict";
let migrationSchemas = [], importRows = [], importBusy = false;
const importEscape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const selectedSchema = () => migrationSchemas.find(item => item.kind === document.getElementById("importKind").value);
let archiveRows = [];
async function loadImportArchive() {
    const box = document.getElementById("importArchiveSummary");
    try {
        const response = await window.adminFetch("/Admin/ImportArchive", { headers: { Accept: "application/json" }, cache: "no-store" });
        const data = await readImportJson(response);
        if (!response.ok || !Array.isArray(data)) throw new Error(data.message || "The archive could not be loaded.");
        archiveRows = data;
        const latest = data.length ? data.map(row => row.archivedAt).sort().at(-1) : null;
        const kinds = [...new Set(data.map(row => row.kind))].map(kind => `${kind}: ${data.filter(row => row.kind === kind).length}`).join(' · ');
        box.textContent = `${data.length} rows archived locally${latest ? ' · Last saved ' + new Date(latest).toLocaleString() : ''}${kinds ? ' · ' + kinds : ''}. Live API data is unchanged.`;
        return true;
    } catch (error) { box.textContent = error.message; return false; }
}
async function exportImportArchive() {
    if (!await loadImportArchive()) return;
    const link = document.createElement("a");
    const url = URL.createObjectURL(new Blob([JSON.stringify(archiveRows, null, 2)], { type: "application/json" }));
    link.href = url; link.download = "eduvo-local-import-archive.json"; link.click(); URL.revokeObjectURL(url);
}

document.addEventListener("DOMContentLoaded", async () => {
    document.getElementById("refreshImportArchive").addEventListener("click", loadImportArchive);
    document.getElementById("exportImportArchive").addEventListener("click", exportImportArchive);
    await loadImportArchive();
    const input = document.getElementById("importFile"), zone = document.getElementById("importDropZone");
    document.getElementById("chooseImportFile").addEventListener("click", () => input.click());
    document.getElementById("downloadImportTemplate").addEventListener("click", downloadImportTemplate);
    document.getElementById("removeImportFile").addEventListener("click", resetImport);
    document.getElementById("showInvalidOnly").addEventListener("change", renderImportRows);
    document.getElementById("startMemberImport").addEventListener("click", startImport);
    document.getElementById("importKind").addEventListener("change", () => { resetImport(); showSchema(); });
    input.addEventListener("change", () => handleImportFile(input.files?.[0]));
    ["dragenter", "dragover"].forEach(name => zone.addEventListener(name, event => { event.preventDefault(); zone.classList.add("dragging"); }));
    ["dragleave", "drop"].forEach(name => zone.addEventListener(name, event => { event.preventDefault(); zone.classList.remove("dragging"); }));
    zone.addEventListener("drop", event => handleImportFile(event.dataTransfer?.files?.[0]));
    try {
        const response = await window.adminFetch("/Admin/ImportSchemas"), data = await readImportJson(response);
        if (!response.ok || !Array.isArray(data)) throw new Error(data.message || "Migration formats could not be loaded. Refresh or sign in again.");
        migrationSchemas = data;
        const select = document.getElementById("importKind");
        select.innerHTML = data.map(item => `<option value="${importEscape(item.kind)}">${importEscape(item.label)}</option>`).join("");
        select.disabled = false; showSchema();
    } catch (error) { showImportMessage(error.message); }
});

function showSchema() {
    const schema = selectedSchema();
    document.getElementById("importSchemaHelp").textContent = `${schema.label}: required columns — ${schema.fields.filter(field => field.required).map(field => field.name).join(", ")}. Dates must be ISO date-times, for example 2026-10-10T00:00:00Z. Boolean fields use true or false. Maximum 500 rows.`;
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
    if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
    row.push(value); if (row.some(cell => cell.trim())) rows.push(row); return rows;
}

function convertImportValue(field, raw) {
    const value = raw.trim();
    if (!value) { if (field.required) throw new Error(`${field.name} is required`); return null; }
    if (field.type === "integer" || field.type === "number") {
        const number = Number(value);
        if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(number)) throw new Error(`${field.name} must be a number`);
        if (field.type === "integer" && (!Number.isInteger(number) || number < -2147483648 || number > 2147483647)) throw new Error(`${field.name} must be a 32-bit whole number`);
        if (field.name === "Latitude" && Math.abs(number) > 90 || field.name === "Longitude" && Math.abs(number) > 180) throw new Error(`${field.name} is outside its valid range`);
        return number;
    }
    if (field.type === "boolean") { if (!/^(true|false)$/i.test(value)) throw new Error(`${field.name} must be true or false`); return value.toLowerCase() === "true"; }
    if (field.type === "date" && (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value)))) throw new Error(`${field.name} must be an ISO date-time`);
    return raw; // Preserve passwords, IDs, notes and rich text exactly as supplied.
}

function validateImportRows(matrix, schema) {
    if (matrix.length < 2) throw new Error("Include a header row and at least one data row.");
    if (matrix.length > 501) throw new Error("Import at most 500 rows per batch.");
    const headers = matrix[0].map(value => value.replace(/^\uFEFF/, "").trim().toLowerCase());
    if (new Set(headers).size !== headers.length) throw new Error("Duplicate column headers.");
    const fields = headers.map(header => schema.fields.find(field => field.name.toLowerCase() === header));
    if (fields.some(field => !field)) throw new Error("Unknown columns. Use the selected migration template.");
    const missing = schema.fields.filter(field => field.required && !headers.includes(field.name.toLowerCase()));
    if (missing.length) throw new Error(`Missing required columns: ${missing.map(field => field.name).join(", ")}`);
    const identities = new Set();
    const identity = schema.fields.find(field => /^(UserId|HighlightId|RewardId|MerchantId|OutletsId|WalletId|TopUpId|SpendId|Id|PointRecordId|AssignRecordId|StampTransactionRecordID)$/i.test(field.name))?.name;
    return matrix.slice(1).map((cells, index) => {
        const data = {}, errors = [];
        if (cells.length !== fields.length) errors.push("Column count does not match the header");
        fields.forEach((field, column) => { try { data[field.name] = convertImportValue(field, cells[column] ?? ""); } catch (error) { errors.push(error.message); } });
        if (identity && data[identity] !== null && data[identity] !== undefined) {
            const key = String(data[identity]);
            if (identities.has(key)) errors.push(`Duplicate ${identity} in file`);
            identities.add(key);
        }
        return { rowNumber: index + 2, data, errors, state: "ready", apiError: "" };
    });
}

async function handleImportFile(file) {
    if (importBusy || !file) return;
    if (!selectedSchema()) return showImportMessage("Wait for migration formats to load.");
    if (!/\.csv$/i.test(file.name) || file.size > 2 * 1024 * 1024) return showImportMessage("Choose a CSV file smaller than 2 MB.");
    try {
        importRows = validateImportRows(parseCsv(await file.text()), selectedSchema());
        document.getElementById("importFileName").textContent = file.name;
        document.getElementById("importFileDetails").textContent = `${importRows.length} rows`;
        document.getElementById("importFileCard").hidden = false; document.getElementById("importResults").hidden = false;
        hideImportMessage(); updateImportSummary(); renderImportRows();
    } catch (error) { resetImport(); showImportMessage(error.message); }
}

function updateImportSummary() {
    const valid = importRows.filter(row => !row.errors.length).length;
    const pending = importRows.filter(row => !row.errors.length && row.state === "ready").length;
    document.getElementById("importTotal").textContent = importRows.length;
    document.getElementById("importValid").textContent = valid; document.getElementById("importInvalid").textContent = importRows.length - valid;
    document.getElementById("importResultText").textContent = `${pending} ready to archive · ${importRows.filter(row => row.state === "imported").length} archived locally`;
    const button = document.getElementById("startMemberImport"); button.disabled = importBusy || !pending;
    button.querySelector("span").textContent = `Archive ${pending} valid rows`;
}

function renderImportRows() {
    const rows = document.getElementById("showInvalidOnly").checked ? importRows.filter(row => row.errors.length || row.apiError) : importRows;
    document.getElementById("importTableBody").innerHTML = rows.map(row => {
        const summary = Object.entries(row.data).filter(([key]) => !/password|imagebyte|receipt/i.test(key)).slice(0, 5).map(([key, value]) => `${key}: ${value ?? "—"}`).join(" · ");
        return `<tr><td>${row.rowNumber}</td><td>${importEscape(summary)}</td><td>${importEscape(row.errors.join("; ") || row.apiError || row.state)}</td></tr>`;
    }).join("");
}

async function startImport() {
    if (importBusy) return;
    const pending = importRows.filter(row => !row.errors.length && row.state === "ready"), schema = selectedSchema();
    if (!pending.length || !window.confirm(`Save ${pending.length} ${schema.label.toLowerCase()} rows to the local archive? Live API data will not change; credentials will not be retained.`)) return;
    importBusy = true;
    for (const id of ["importKind", "chooseImportFile", "removeImportFile", "downloadImportTemplate"]) document.getElementById(id).disabled = true;
    document.getElementById("importProgressTrack").hidden = false; updateImportSummary();
    let processed = 0;
    try {
        for (const row of pending) {
            document.getElementById("importProgressTitle").textContent = `Importing row ${row.rowNumber}`;
            try {
                const response = await window.adminFetch(`/Admin/ImportRow?kind=${encodeURIComponent(schema.kind)}`, {
                    method: "POST", headers: { "Content-Type": "application/json", "RequestVerificationToken": document.querySelector("#migrationToken input").value }, body: JSON.stringify(row.data)
                });
                const data = await readImportJson(response);
                if (!response.ok || data?.success === false) {
                    row.state = response.status >= 500 || response.status === 408 || response.status === 504 ? "unconfirmed" : "rejected";
                    row.apiError = data.message || "The import was not accepted.";
                    if (row.state === "unconfirmed") row.apiError += " Check existing records before retrying; it may already have been applied.";
                    if (response.status === 401 || response.status === 403 || row.state === "unconfirmed") break;
                } else if (data.archived === true) { row.state = "imported"; row.apiError = data.duplicate ? "Already archived locally" : "Saved in local archive"; }
                else { row.state = "unconfirmed"; row.apiError = "No archive confirmation received."; break; }
            } catch (error) {
                row.state = "unconfirmed"; row.apiError = "No confirmation received. Check existing records before retrying; this row may already have been applied."; break;
            }
            processed++; document.getElementById("importProgressBar").style.width = `${Math.round(processed / pending.length * 100)}%`; renderImportRows();
        }
    } finally {
        importBusy = false;
        for (const id of ["importKind", "chooseImportFile", "removeImportFile", "downloadImportTemplate"]) document.getElementById(id).disabled = false;
        document.getElementById("importProgressTitle").textContent = "Batch finished";
        document.getElementById("importProgressText").textContent = `${importRows.filter(row => row.state === "imported").length} archived locally · ${importRows.filter(row => row.state !== "imported" && row.apiError).length} need review`;
        renderImportRows(); updateImportSummary();
        await loadImportArchive();
    }
}

function downloadImportTemplate() {
    const schema = selectedSchema(); if (!schema || importBusy) return;
    const csv = schema.fields.map(field => `"${field.name}"`).join(",") + "\r\n";
    const link = document.createElement("a"), url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    link.href = url; link.download = `${schema.kind}-migration-template.csv`; link.click(); URL.revokeObjectURL(url);
}
function resetImport() { if (importBusy) return; importRows = []; document.getElementById("importFile").value = ""; for (const id of ["importFileCard", "importResults", "importProgressTrack"]) document.getElementById(id).hidden = true; document.getElementById("importProgressBar").style.width = "0"; hideImportMessage(); }
function showImportMessage(text) { const box = document.getElementById("importMessage"); box.textContent = text; box.hidden = false; }
function hideImportMessage() { document.getElementById("importMessage").hidden = true; }
async function readImportJson(response) { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return { message: text || `HTTP ${response.status}` }; } }
