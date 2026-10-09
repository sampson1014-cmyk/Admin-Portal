"use strict";

let stampRows = [];
let stampRequest = null;
let stampsLoading = false;
let editingStampIndex = null;
let deletingStampIndex = null;

const stampValue = (row, ...keys) => { for (const key of keys) { const match = Object.keys(row || {}).find(candidate => candidate.toLowerCase() === key.toLowerCase()); if (match && row[match] !== undefined && row[match] !== null) return row[match]; } return ""; };
const stampId = row => Number(stampValue(row, "Id") || 0);
const stampName = row => stampValue(row, "Name", "StampId") || "Untitled campaign";
const stampTarget = row => Number(stampValue(row, "Point") || 0);
const stampCreated = row => stampValue(row, "CreateDate");
const stampExpires = row => stampValue(row, "ExpireDate");
const stampStoredStatus = row => stampValue(row, "Status") || "Inactive";
const stampEscape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("refreshStamps").addEventListener("click", () => stampsLoading ? stampRequest?.abort() : loadStamps());
    document.getElementById("retryStamps").addEventListener("click", loadStamps);
    document.getElementById("addStamp").addEventListener("click", () => openStampForm());
    document.getElementById("stampForm").addEventListener("submit", saveStamp);
    document.getElementById("confirmDeleteStamp").addEventListener("click", deleteStamp);
    document.getElementById("exportStamps").addEventListener("click", exportStamps);
    document.getElementById("stampSearch").addEventListener("input", renderStamps);
    document.getElementById("stampStatus").addEventListener("change", renderStamps);
    document.getElementById("stampSort").addEventListener("change", renderStamps);
    document.getElementById("stampTableBody").addEventListener("click", event => {
        const edit = event.target.closest("button[data-edit-stamp]");
        const remove = event.target.closest("button[data-delete-stamp]");
        if (edit) openStampForm(Number(edit.dataset.editStamp));
        if (remove) openDeleteStamp(Number(remove.dataset.deleteStamp));
    });
    loadStamps();
});

async function loadStamps() {
    stampRequest?.abort();
    stampRequest = new AbortController();
    const controller = stampRequest;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
    setStampsLoading(true);
    hideStampMessage();
    try {
        const response = await fetch("/Admin/StampCampaigns", { headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" }, cache: "no-store", signal: controller.signal });
        const data = await readStampJson(response);
        if (!response.ok || data?.success === false) throw new Error(stampApiMessage(data, "Unable to load stamp campaigns."));
        stampRows = extractStampArray(data);
        updateStampSummary();
        renderStamps();
    } catch (error) {
        const message = error.name === "AbortError" ? (timedOut ? "The API did not respond within 20 seconds. Check API authorization and try again." : "Loading cancelled. Select Refresh to try again.") : error.message || "Unable to load stamp campaigns.";
        stampRows = [];
        updateStampSummary();
        renderStamps();
        showStampEmpty(timedOut ? "Request timed out" : "Campaigns not loaded", message, true);
        showStampMessage(message, "error");
    } finally { clearTimeout(timeout); setStampsLoading(false); }
}

function extractStampArray(data, visited = new Set()) { if (Array.isArray(data)) return data; if (!data || typeof data !== "object" || visited.has(data)) return []; visited.add(data); for (const value of Object.values(data)) { if (Array.isArray(value)) return value; const nested = extractStampArray(value, visited); if (nested.length) return nested; } return []; }
function stampTimestamp(value) { if (!value) return 0; const dotNet = /\/Date\((\d+)(?:[+-]\d+)?\)\//.exec(String(value)); if (dotNet) return Number(dotNet[1]); const time = new Date(value).getTime(); return Number.isNaN(time) ? 0 : time; }
function stampEffectiveStatus(row) { const expiry = stampTimestamp(stampExpires(row)); return expiry && expiry < Date.now() ? "Expired" : String(stampStoredStatus(row)); }

function updateStampSummary() {
    const active = stampRows.filter(row => stampEffectiveStatus(row).toLowerCase() === "active").length;
    const expired = stampRows.filter(row => stampEffectiveStatus(row).toLowerCase() === "expired").length;
    const average = stampRows.length ? stampRows.reduce((sum, row) => sum + stampTarget(row), 0) / stampRows.length : 0;
    document.getElementById("stampTotal").textContent = stampRows.length.toLocaleString();
    document.getElementById("stampActive").textContent = active.toLocaleString();
    document.getElementById("stampExpired").textContent = expired.toLocaleString();
    document.getElementById("stampAverage").textContent = Math.round(average).toLocaleString();
}

function visibleStamps() {
    const search = document.getElementById("stampSearch").value.trim().toLowerCase();
    const status = document.getElementById("stampStatus").value.toLowerCase();
    const sort = document.getElementById("stampSort").value;
    const rows = stampRows.map((row, index) => ({ row, index })).filter(({ row }) => {
        const haystack = [stampName(row), stampValue(row, "StampId"), stampValue(row, "Description"), stampTarget(row)].join(" ").toLowerCase();
        return (!status || stampEffectiveStatus(row).toLowerCase() === status) && (!search || haystack.includes(search));
    });
    rows.sort((a, b) => { if (sort === "expiry") return (stampTimestamp(stampExpires(a.row)) || Number.MAX_SAFE_INTEGER) - (stampTimestamp(stampExpires(b.row)) || Number.MAX_SAFE_INTEGER); if (sort === "target-asc") return stampTarget(a.row) - stampTarget(b.row); if (sort === "target-desc") return stampTarget(b.row) - stampTarget(a.row); if (sort === "name") return String(stampName(a.row)).localeCompare(String(stampName(b.row))); return stampTimestamp(stampCreated(b.row)) - stampTimestamp(stampCreated(a.row)) || stampId(b.row) - stampId(a.row); });
    return rows;
}

function renderStamps() {
    const rows = visibleStamps();
    document.getElementById("stampResultText").textContent = `Showing ${rows.length.toLocaleString()} of ${stampRows.length.toLocaleString()} campaigns`;
    document.getElementById("exportStamps").disabled = rows.length === 0;
    const wrapper = document.getElementById("stampTableWrapper");
    const body = document.getElementById("stampTableBody");
    if (!rows.length) { wrapper.hidden = true; body.innerHTML = ""; showStampEmpty(stampRows.length ? "No matching campaigns" : "No campaigns yet", stampRows.length ? "Change or clear the filters to see more campaigns." : "Create the first stamp campaign."); return; }
    document.getElementById("stampEmpty").hidden = true;
    wrapper.hidden = false;
    body.innerHTML = rows.map(({ row, index }) => {
        const image = safeStampImage(stampValue(row, "Image"));
        const status = stampEffectiveStatus(row);
        const inactive = status.toLowerCase() !== "active";
        return `<tr><td><div class="stamp-product">${image ? `<img src="${stampEscape(image)}" alt="" />` : '<span><i class="bi bi-award"></i></span>'}<div><strong>${stampEscape(stampName(row))}</strong><small>${stampEscape(stampValue(row, "Description") || stampValue(row, "StampId") || "No description")}</small></div></div></td><td><span class="stamp-target"><strong>${stampTarget(row).toLocaleString()}</strong><small>stamps</small></span></td><td>${stampEscape(formatStampDate(stampCreated(row), "-"))}</td><td><span class="stamp-date">${stampEscape(formatStampDate(stampExpires(row), "No expiry"))}</span><small>${stampExpiryLabel(row)}</small></td><td><span class="stamp-status ${inactive ? "inactive" : ""}">${stampEscape(status)}</span></td><td><div class="stamp-actions"><button type="button" data-edit-stamp="${index}" aria-label="Edit ${stampEscape(stampName(row))}"><i class="bi bi-pencil"></i></button><button type="button" class="delete" data-delete-stamp="${index}" aria-label="Delete ${stampEscape(stampName(row))}"><i class="bi bi-trash3"></i></button></div></td></tr>`;
    }).join("");
}

function openStampForm(index = null) {
    editingStampIndex = Number.isInteger(index) ? index : null;
    const row = editingStampIndex === null ? null : stampRows[editingStampIndex];
    document.getElementById("stampFormModal").classList.toggle("editing", Boolean(row));
    document.getElementById("stampForm").reset();
    const fields = { stampId: row ? stampId(row) : "", stampName: row ? stampValue(row, "Name") : "", stampPoint: row ? stampTarget(row) : "", stampImage: row ? stampValue(row, "Image") : "", stampCreateDate: row ? stampDateInput(stampCreated(row)) : stampDateInput(new Date()), stampExpireDate: row ? stampDateInput(stampExpires(row)) : stampDateInput(new Date(Date.now() + 365 * 86400000)), stampDescription: row ? stampValue(row, "Description") : "" };
    Object.entries(fields).forEach(([id, value]) => { document.getElementById(id).value = value; });
    const state = row && stampStoredStatus(row).toLowerCase() !== "active" ? "Inactive" : "Active";
    document.getElementById("stampStatusInput").value = state;
    document.getElementById("stampFormEyebrow").textContent = row ? "Update campaign" : "New campaign";
    document.getElementById("stampFormTitle").textContent = row ? `Edit ${stampName(row)}` : "Create stamp campaign";
    document.querySelector("#saveStamp span:last-child").textContent = row ? "Save changes" : "Create campaign";
    const saveIcon = document.querySelector("#saveStamp .stamp-save-icon");
    if (saveIcon) saveIcon.className = row ? "bi bi-check2 stamp-save-icon" : "bi bi-plus-lg stamp-save-icon";
    document.getElementById("stampFormError").hidden = true;
    bootstrap.Modal.getOrCreateInstance(document.getElementById("stampFormModal")).show();
}

async function saveStamp(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const errorBox = document.getElementById("stampFormError");
    errorBox.hidden = true;
    if (!form.checkValidity()) { const invalid = form.querySelector(":invalid"); errorBox.textContent = invalid?.id === "stampName" ? "Enter a campaign name." : invalid?.id === "stampPoint" ? "Enter a target of at least 1 stamp." : "Complete the required campaign dates and fields."; errorBox.hidden = false; invalid?.focus(); return; }
    const start = new Date(document.getElementById("stampCreateDate").value);
    const expiry = new Date(document.getElementById("stampExpireDate").value);
    if (expiry <= start) { errorBox.textContent = "Expiry date must be later than the start date."; errorBox.hidden = false; document.getElementById("stampExpireDate").focus(); return; }
    const row = editingStampIndex === null ? null : stampRows[editingStampIndex];
    const payload = { ...(row || {}), Name: document.getElementById("stampName").value.trim(), Point: Number(document.getElementById("stampPoint").value), Status: document.getElementById("stampStatusInput").value, Image: document.getElementById("stampImage").value.trim(), ImageByte: row ? stampValue(row, "ImageByte") : "", CreateDate: start.toISOString(), ExpireDate: expiry.toISOString(), Description: document.getElementById("stampDescription").value.trim() };
    if (row) payload.Id = stampId(row);
    const button = document.getElementById("saveStamp");
    setStampButtonBusy(button, true, row ? "Saving..." : "Creating...");
    try { const response = await fetch(row ? "/Admin/EditStampCampaign" : "/Admin/CreateStampCampaign", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) }); const data = await readStampJson(response); if (!response.ok || data?.success === false) throw new Error(stampApiMessage(data, `Unable to ${row ? "update" : "create"} the campaign.`)); bootstrap.Modal.getInstance(document.getElementById("stampFormModal"))?.hide(); await loadStamps(); showStampMessage(`Campaign ${row ? "updated" : "created"} successfully.`, "success"); }
    catch (error) { const message = error.message || "Unable to save the campaign."; errorBox.textContent = /Failed to fetch|404|not found/i.test(message) ? "The running server does not have the latest stamp actions. Restart the project, sign in again, and retry." : message; errorBox.hidden = false; }
    finally { setStampButtonBusy(button, false, row ? "Save changes" : "Create campaign"); }
}

function openDeleteStamp(index) { deletingStampIndex = index; const row = stampRows[index]; if (!row) return; document.getElementById("stampDeleteName").textContent = stampName(row); document.getElementById("stampDeleteError").hidden = true; bootstrap.Modal.getOrCreateInstance(document.getElementById("stampDeleteModal")).show(); }
async function deleteStamp() { const row = stampRows[deletingStampIndex]; if (!row) return; const button = document.getElementById("confirmDeleteStamp"); const errorBox = document.getElementById("stampDeleteError"); setStampButtonBusy(button, true, "Deleting..."); errorBox.hidden = true; try { const response = await fetch(`/Admin/DeleteStampCampaign?id=${encodeURIComponent(stampId(row))}`, { method: "POST", headers: { Accept: "application/json" } }); const data = await readStampJson(response); if (!response.ok || data?.success === false) throw new Error(stampApiMessage(data, "Unable to delete the campaign.")); bootstrap.Modal.getInstance(document.getElementById("stampDeleteModal"))?.hide(); await loadStamps(); showStampMessage("Campaign deleted successfully.", "success"); } catch (error) { errorBox.textContent = error.message || "Unable to delete the campaign."; errorBox.hidden = false; } finally { setStampButtonBusy(button, false, "Delete campaign"); } }

function exportStamps() { const rows = visibleStamps(); if (!rows.length) return; const table = [["ID", "Stamp ID", "Name", "Target", "Description", "Created", "Expires", "Status"], ...rows.map(({ row }) => [stampId(row), stampValue(row, "StampId"), stampName(row), stampTarget(row), stampValue(row, "Description"), stampCreated(row), stampExpires(row), stampEffectiveStatus(row)])]; const csv = table.map(columns => columns.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" })); link.download = `stamp-campaigns-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(link.href); }
function formatStampDate(value, fallback = "-") { const time = stampTimestamp(value); return time ? new Date(time).toLocaleDateString(undefined, { year:"numeric", month:"short", day:"2-digit" }) : fallback; }
function stampDateInput(value) { const time = value instanceof Date ? value.getTime() : stampTimestamp(value); if (!time) return ""; const date = new Date(time - new Date(time).getTimezoneOffset() * 60000); return date.toISOString().slice(0,16); }
function stampExpiryLabel(row) { const time = stampTimestamp(stampExpires(row)); if (!time) return "No expiry date"; if (time < Date.now()) return "Expired"; const days = Math.ceil((time - Date.now()) / 86400000); return days <= 30 ? `${days} days remaining` : "Expiry date"; }
function safeStampImage(value) { const image = String(value || "").trim(); return /^(https?:\/\/|data:image\/)/i.test(image) ? image : ""; }
function setStampsLoading(show) { stampsLoading = show; document.getElementById("stampLoading").hidden = !show; const button = document.getElementById("refreshStamps"); button.querySelector("span").textContent = show ? "Cancel" : "Refresh"; button.querySelector("i").className = show ? "bi bi-x-lg" : "bi bi-arrow-clockwise"; if (show) { document.getElementById("stampTableWrapper").hidden = true; document.getElementById("stampEmpty").hidden = true; document.getElementById("exportStamps").disabled = true; } }
function setStampButtonBusy(button, busy, label) { button.disabled = busy; button.querySelector(".spinner-border").hidden = !busy; button.querySelector(".stamp-save-icon")?.classList.toggle("d-none", busy); button.querySelector("span:last-child").textContent = label; }
function showStampEmpty(title,text,retry=false) { document.getElementById("stampEmptyTitle").textContent=title; document.getElementById("stampEmptyText").textContent=text; document.getElementById("retryStamps").hidden=!retry; document.getElementById("stampEmpty").hidden=false; }
function showStampMessage(text,type) { const box=document.getElementById("stampMessage"); box.textContent=text; box.className=`stamp-message ${type||""}`; box.hidden=false; }
function hideStampMessage() { document.getElementById("stampMessage").hidden=true; }
async function readStampJson(response) { const text=await response.text(); try{return text?JSON.parse(text):{};}catch{return{message:text||`HTTP ${response.status}`};} }
function stampApiMessage(data,fallback) { if(data?.errors)return Object.values(data.errors).flat().join(" "); return data?.message||data?.title||fallback; }
