"use strict";

let voucherRows = [];
let voucherRequest = null;
let vouchersLoading = false;
let editingVoucherIndex = null;
let deletingVoucherIndex = null;

const voucherValue = (row, ...keys) => { for (const key of keys) { const match = Object.keys(row || {}).find(candidate => candidate.toLowerCase() === key.toLowerCase()); if (match && row[match] !== undefined && row[match] !== null) return row[match]; } return ""; };
const voucherId = row => Number(voucherValue(row, "Id") || 0);
const voucherName = row => voucherValue(row, "Name", "Title", "RewardId") || "Untitled voucher";
const voucherPoints = row => Number(voucherValue(row, "Point") || 0);
const voucherStatus = row => voucherValue(row, "Status") || "Inactive";
const voucherCategory = row => voucherValue(row, "Category") || "Uncategorized";
const voucherCreated = row => voucherValue(row, "CreateDate");
const voucherExpires = row => voucherValue(row, "ExpireDate");
const voucherEscape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("refreshVouchers").addEventListener("click", () => vouchersLoading ? voucherRequest?.abort() : loadVouchers());
    document.getElementById("retryVouchers").addEventListener("click", loadVouchers);
    document.getElementById("addVoucher").addEventListener("click", () => openVoucherForm());
    document.getElementById("voucherForm").addEventListener("submit", saveVoucher);
    document.getElementById("confirmDeleteVoucher").addEventListener("click", deleteVoucher);
    document.getElementById("exportVouchers").addEventListener("click", exportVouchers);
    ["voucherSearch", "voucherStatus", "voucherCategory", "voucherSort"].forEach(id => document.getElementById(id).addEventListener(id === "voucherSearch" ? "input" : "change", renderVouchers));
    document.getElementById("voucherTableBody").addEventListener("click", event => {
        const edit = event.target.closest("button[data-edit-voucher]");
        const remove = event.target.closest("button[data-delete-voucher]");
        if (edit) openVoucherForm(Number(edit.dataset.editVoucher));
        if (remove) openDeleteVoucher(Number(remove.dataset.deleteVoucher));
    });
    loadVouchers();
});

async function loadVouchers() {
    voucherRequest?.abort();
    voucherRequest = new AbortController();
    const controller = voucherRequest;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
    setVouchersLoading(true);
    hideVoucherMessage();
    try {
        const response = await fetch("/Admin/Vouchers", { headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" }, cache: "no-store", signal: controller.signal });
        const data = await readVoucherJson(response);
        if (!response.ok || data?.success === false) throw new Error(voucherApiMessage(data, "Unable to load vouchers."));
        voucherRows = extractVoucherArray(data).filter(isVoucherRecord);
        updateVoucherFilters();
        updateVoucherSummary();
        renderVouchers();
    } catch (error) {
        const message = error.name === "AbortError" ? (timedOut ? "The API did not respond within 20 seconds. Check API authorization and try again." : "Loading cancelled. Select Refresh to try again.") : error.message || "Unable to load vouchers.";
        voucherRows = [];
        updateVoucherSummary();
        renderVouchers();
        showVoucherEmpty(timedOut ? "Request timed out" : "Vouchers not loaded", message, true);
        showVoucherMessage(message, "error");
    } finally { clearTimeout(timeout); setVouchersLoading(false); }
}

function isVoucherRecord(row) { return String(voucherValue(row, "Type")).toLowerCase() === "voucher" || String(voucherValue(row, "RewardId")).toLowerCase().startsWith("voucher-"); }
function extractVoucherArray(data, visited = new Set()) { if (Array.isArray(data)) return data; if (!data || typeof data !== "object" || visited.has(data)) return []; visited.add(data); for (const value of Object.values(data)) { if (Array.isArray(value)) return value; const nested = extractVoucherArray(value, visited); if (nested.length) return nested; } return []; }

function updateVoucherFilters() {
    fillVoucherFilter("voucherStatus", "All statuses", voucherRows.map(voucherStatus));
    fillVoucherFilter("voucherCategory", "All categories", voucherRows.map(voucherCategory));
}

function fillVoucherFilter(id, label, values) { const select = document.getElementById(id); const previous = select.value; const options = [...new Set(values.map(String).map(value => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)); select.innerHTML = `<option value="">${label}</option>` + options.map(value => `<option value="${voucherEscape(value)}">${voucherEscape(value)}</option>`).join(""); if (options.includes(previous)) select.value = previous; }

function updateVoucherSummary() {
    const now = Date.now();
    const active = voucherRows.filter(row => voucherStatus(row).toLowerCase() === "active" && (!voucherTimestamp(voucherExpires(row)) || voucherTimestamp(voucherExpires(row)) >= now)).length;
    const expired = voucherRows.filter(row => voucherStatus(row).toLowerCase() === "expired" || (voucherTimestamp(voucherExpires(row)) > 0 && voucherTimestamp(voucherExpires(row)) < now)).length;
    const average = voucherRows.length ? voucherRows.reduce((sum, row) => sum + voucherPoints(row), 0) / voucherRows.length : 0;
    document.getElementById("voucherTotal").textContent = voucherRows.length.toLocaleString();
    document.getElementById("voucherActive").textContent = active.toLocaleString();
    document.getElementById("voucherExpired").textContent = expired.toLocaleString();
    document.getElementById("voucherAveragePoints").textContent = Math.round(average).toLocaleString();
}

function visibleVouchers() {
    const search = document.getElementById("voucherSearch").value.trim().toLowerCase();
    const status = document.getElementById("voucherStatus").value.toLowerCase();
    const category = document.getElementById("voucherCategory").value.toLowerCase();
    const sort = document.getElementById("voucherSort").value;
    const rows = voucherRows.map((row, index) => ({ row, index })).filter(({ row }) => {
        const haystack = [voucherName(row), voucherValue(row, "Title", "SubTitle", "ShortTitle", "Description"), voucherCategory(row), voucherValue(row, "RewardId")].join(" ").toLowerCase();
        return (!status || voucherStatus(row).toLowerCase() === status) && (!category || voucherCategory(row).toLowerCase() === category) && (!search || haystack.includes(search));
    });
    rows.sort((a, b) => { if (sort === "expiry") return (voucherTimestamp(voucherExpires(a.row)) || Number.MAX_SAFE_INTEGER) - (voucherTimestamp(voucherExpires(b.row)) || Number.MAX_SAFE_INTEGER); if (sort === "points-asc") return voucherPoints(a.row) - voucherPoints(b.row); if (sort === "points-desc") return voucherPoints(b.row) - voucherPoints(a.row); if (sort === "name") return String(voucherName(a.row)).localeCompare(String(voucherName(b.row))); return voucherTimestamp(voucherCreated(b.row)) - voucherTimestamp(voucherCreated(a.row)) || voucherId(b.row) - voucherId(a.row); });
    return rows;
}

function renderVouchers() {
    const rows = visibleVouchers();
    document.getElementById("voucherResultText").textContent = `Showing ${rows.length.toLocaleString()} of ${voucherRows.length.toLocaleString()} vouchers`;
    document.getElementById("exportVouchers").disabled = rows.length === 0;
    const wrapper = document.getElementById("voucherTableWrapper");
    const body = document.getElementById("voucherTableBody");
    if (!rows.length) { wrapper.hidden = true; body.innerHTML = ""; showVoucherEmpty(voucherRows.length ? "No matching vouchers" : "No vouchers yet", voucherRows.length ? "Change or clear the filters to see more vouchers." : "Create the first voucher for members."); return; }
    document.getElementById("voucherEmpty").hidden = true;
    wrapper.hidden = false;
    body.innerHTML = rows.map(({ row, index }) => {
        const image = safeVoucherImage(voucherValue(row, "Image"));
        const status = String(voucherStatus(row));
        const inactive = status.toLowerCase() !== "active";
        const subtitle = voucherValue(row, "SubTitle", "ShortTitle", "Description") || "No subtitle provided";
        return `<tr><td><div class="voucher-product">${image ? `<img src="${voucherEscape(image)}" alt="" />` : '<span><i class="bi bi-ticket-perforated"></i></span>'}<div><strong>${voucherEscape(voucherName(row))}</strong><small>${voucherEscape(subtitle)}</small></div></div></td><td><span class="voucher-category">${voucherEscape(voucherCategory(row))}</span></td><td><strong class="voucher-points">${voucherPoints(row).toLocaleString()} pts</strong></td><td>${voucherEscape(formatVoucherDate(voucherCreated(row), "-"))}</td><td><span class="voucher-date">${voucherEscape(formatVoucherDate(voucherExpires(row), "No expiry"))}</span><small>${voucherExpiryLabel(row)}</small></td><td><span class="voucher-status ${inactive ? "inactive" : ""}">${voucherEscape(status)}</span></td><td><div class="voucher-actions"><button type="button" data-edit-voucher="${index}" aria-label="Edit ${voucherEscape(voucherName(row))}"><i class="bi bi-pencil"></i></button><button type="button" class="delete" data-delete-voucher="${index}" aria-label="Delete ${voucherEscape(voucherName(row))}"><i class="bi bi-trash3"></i></button></div></td></tr>`;
    }).join("");
}

function openVoucherForm(index = null) {
    editingVoucherIndex = Number.isInteger(index) ? index : null;
    const row = editingVoucherIndex === null ? null : voucherRows[editingVoucherIndex];
    document.getElementById("voucherFormModal").classList.toggle("editing", Boolean(row));
    document.getElementById("voucherForm").reset();
    const fields = { voucherId: row ? voucherId(row) : "", voucherName: row ? voucherValue(row, "Name") : "", voucherTitle: row ? voucherValue(row, "Title") : "", voucherShortTitle: row ? voucherValue(row, "ShortTitle") : "", voucherSubTitle: row ? voucherValue(row, "SubTitle") : "", voucherPoint: row ? voucherPoints(row) : "", voucherCategoryInput: row ? voucherValue(row, "Category") : "", voucherImage: row ? voucherValue(row, "Image") : "", voucherCreateDate: row ? voucherDateInput(voucherCreated(row)) : voucherDateInput(new Date()), voucherExpireDate: row ? voucherDateInput(voucherExpires(row)) : "", voucherDescription: row ? voucherValue(row, "Description") : "", voucherDescriptionIos: row ? voucherValue(row, "DescriptionIOS") : "", voucherTnc: row ? voucherValue(row, "TnC") : "" };
    Object.entries(fields).forEach(([id, value]) => { document.getElementById(id).value = value; });
    const state = row ? String(voucherStatus(row)) : "Active";
    const statusSelect = document.getElementById("voucherStatusInput");
    statusSelect.value = [...statusSelect.options].some(option => option.value === state) ? state : "Inactive";
    document.getElementById("voucherFormEyebrow").textContent = row ? "Update voucher" : "New voucher";
    document.getElementById("voucherFormTitle").textContent = row ? `Edit ${voucherName(row)}` : "Create a new voucher";
    document.querySelector("#saveVoucher span:last-child").textContent = row ? "Save changes" : "Create voucher";
    document.getElementById("voucherFormError").hidden = true;
    bootstrap.Modal.getOrCreateInstance(document.getElementById("voucherFormModal")).show();
}

async function saveVoucher(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const errorBox = document.getElementById("voucherFormError");
    errorBox.hidden = true;
    if (!form.checkValidity()) { const invalid = form.querySelector(":invalid"); errorBox.textContent = invalid?.id === "voucherName" ? "Enter a voucher name." : invalid?.id === "voucherPoint" ? "Enter the points required using 0 or a positive number." : "Complete the required fields before saving."; errorBox.hidden = false; invalid?.focus(); invalid?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const row = editingVoucherIndex === null ? null : voucherRows[editingVoucherIndex];
    const description = document.getElementById("voucherDescription").value.trim();
    const descriptionIos = document.getElementById("voucherDescriptionIos").value.trim();
    const payload = { ...(row || {}), Name: document.getElementById("voucherName").value.trim(), Title: document.getElementById("voucherTitle").value.trim(), ShortTitle: document.getElementById("voucherShortTitle").value.trim(), SubTitle: document.getElementById("voucherSubTitle").value.trim(), Point: Number(document.getElementById("voucherPoint").value), Category: document.getElementById("voucherCategoryInput").value.trim() || "All", Status: document.getElementById("voucherStatusInput").value, Image: document.getElementById("voucherImage").value.trim(), ImageByte: row ? voucherValue(row, "ImageByte") : "", CreateDate: voucherIsoDate(document.getElementById("voucherCreateDate").value), ExpireDate: voucherIsoDate(document.getElementById("voucherExpireDate").value), Description: description, DescriptionIOS: descriptionIos || description || "No description provided.", TnC: document.getElementById("voucherTnc").value.trim(), Type: "Voucher" };
    if (row) payload.Id = voucherId(row);
    const button = document.getElementById("saveVoucher");
    setVoucherButtonBusy(button, true, row ? "Saving..." : "Creating...");
    try {
        const response = await fetch(row ? "/Admin/EditVoucher" : "/Admin/CreateVoucher", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
        const data = await readVoucherJson(response);
        if (!response.ok || data?.success === false) throw new Error(voucherApiMessage(data, `Unable to ${row ? "update" : "create"} the voucher.`));
        bootstrap.Modal.getInstance(document.getElementById("voucherFormModal"))?.hide();
        await loadVouchers();
        showVoucherMessage(`Voucher ${row ? "updated" : "created"} successfully.`, "success");
    } catch (error) { const message = error.message || "Unable to save the voucher."; errorBox.textContent = /Failed to fetch|404|not found/i.test(message) ? "The running server does not have the latest voucher actions. Restart the project, sign in again, and retry." : message; errorBox.hidden = false; }
    finally { setVoucherButtonBusy(button, false, row ? "Save changes" : "Create voucher"); }
}

function openDeleteVoucher(index) { deletingVoucherIndex = index; const row = voucherRows[index]; if (!row) return; document.getElementById("voucherDeleteName").textContent = voucherName(row); document.getElementById("voucherDeleteError").hidden = true; bootstrap.Modal.getOrCreateInstance(document.getElementById("voucherDeleteModal")).show(); }
async function deleteVoucher() { const row = voucherRows[deletingVoucherIndex]; if (!row) return; const button = document.getElementById("confirmDeleteVoucher"); const errorBox = document.getElementById("voucherDeleteError"); setVoucherButtonBusy(button, true, "Deleting..."); errorBox.hidden = true; try { const response = await fetch(`/Admin/DeleteVoucher?id=${encodeURIComponent(voucherId(row))}`, { method: "POST", headers: { Accept: "application/json" } }); const data = await readVoucherJson(response); if (!response.ok || data?.success === false) throw new Error(voucherApiMessage(data, "Unable to delete the voucher.")); bootstrap.Modal.getInstance(document.getElementById("voucherDeleteModal"))?.hide(); await loadVouchers(); showVoucherMessage("Voucher deleted successfully.", "success"); } catch (error) { errorBox.textContent = error.message || "Unable to delete the voucher."; errorBox.hidden = false; } finally { setVoucherButtonBusy(button, false, "Delete voucher"); } }

function exportVouchers() { const rows = visibleVouchers(); if (!rows.length) return; const table = [["ID", "Voucher ID", "Name", "Title", "Category", "Points", "Status", "Created", "Expires"], ...rows.map(({ row }) => [voucherId(row), voucherValue(row, "RewardId"), voucherName(row), voucherValue(row, "Title"), voucherCategory(row), voucherPoints(row), voucherStatus(row), voucherCreated(row), voucherExpires(row)])]; const csv = table.map(columns => columns.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" })); link.download = `vouchers-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href); }

function voucherTimestamp(value) { if (!value) return 0; const dotNet = /\/Date\((\d+)(?:[+-]\d+)?\)\//.exec(String(value)); if (dotNet) return Number(dotNet[1]); const parsed = new Date(value).getTime(); return Number.isNaN(parsed) ? 0 : parsed; }
function formatVoucherDate(value, fallback = "-") { const time = voucherTimestamp(value); return time ? new Date(time).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" }) : fallback; }
function voucherDateInput(value) { const time = value instanceof Date ? value.getTime() : voucherTimestamp(value); if (!time) return ""; const date = new Date(time - new Date(time).getTimezoneOffset() * 60000); return date.toISOString().slice(0, 16); }
function voucherIsoDate(value) { return value ? new Date(value).toISOString() : null; }
function voucherExpiryLabel(row) { const time = voucherTimestamp(voucherExpires(row)); if (!time) return "No expiry date"; if (time < Date.now()) return "Expired"; const days = Math.ceil((time - Date.now()) / 86400000); return days <= 30 ? `${days} days remaining` : "Expiry date"; }
function safeVoucherImage(value) { const image = String(value || "").trim(); return /^(https?:\/\/|data:image\/)/i.test(image) ? image : ""; }
function setVouchersLoading(show) { vouchersLoading = show; document.getElementById("voucherLoading").hidden = !show; const button = document.getElementById("refreshVouchers"); button.querySelector("span").textContent = show ? "Cancel" : "Refresh"; button.querySelector("i").className = show ? "bi bi-x-lg" : "bi bi-arrow-clockwise"; if (show) { document.getElementById("voucherTableWrapper").hidden = true; document.getElementById("voucherEmpty").hidden = true; document.getElementById("exportVouchers").disabled = true; } }
function setVoucherButtonBusy(button, busy, label) { button.disabled = busy; button.querySelector(".spinner-border").hidden = !busy; button.querySelector("span:last-child").textContent = label; }
function showVoucherEmpty(title, text, retry = false) { document.getElementById("voucherEmptyTitle").textContent = title; document.getElementById("voucherEmptyText").textContent = text; document.getElementById("retryVouchers").hidden = !retry; document.getElementById("voucherEmpty").hidden = false; }
function showVoucherMessage(text, type) { const box = document.getElementById("voucherMessage"); box.textContent = text; box.className = `voucher-message ${type || ""}`; box.hidden = false; }
function hideVoucherMessage() { document.getElementById("voucherMessage").hidden = true; }
async function readVoucherJson(response) { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return { message: text || `HTTP ${response.status}` }; } }
function voucherApiMessage(data, fallback) { if (data?.errors) return Object.values(data.errors).flat().join(" "); return data?.message || data?.title || fallback; }
