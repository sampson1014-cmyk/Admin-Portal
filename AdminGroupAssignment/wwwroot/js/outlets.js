"use strict";

let outlets = [], filteredOutlets = [], editingOutlet = null, outletModal;
const field = name => document.getElementById(`outlet${name}`);
const get = (item, names, fallback = "") => names.map(name => item?.[name]).find(value => value !== undefined && value !== null) ?? fallback;
const outletId = item => get(item, ["id", "Id"]);
const outletCode = item => get(item, ["outletsId", "OutletsId", "outletId", "OutletId", "outletCode", "OutletCode"]);
const outletName = item => get(item, ["outletName", "OutletName", "name", "Name"]);
const phone = item => get(item, ["phone", "Phone", "phone1", "Phone1", "phoneNumber", "PhoneNumber"]);
const address = item => get(item, ["address", "Address"]);
const status = item => get(item, ["status", "Status", "accountStatus", "AccountStatus"], "Inactive");
const isActive = item => ["active", "activated", "enabled"].includes(String(status(item)).toLowerCase());
const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const displayOutletValue = value => escapeHtml(String(value ?? "").trim() || "Empty");

document.addEventListener("DOMContentLoaded", () => {
    outletModal = document.getElementById("outletModal");
    document.getElementById("refreshOutlets").addEventListener("click", loadOutlets);
    document.getElementById("addOutletButton").addEventListener("click", openCreate);
    document.getElementById("closeOutletModal").addEventListener("click", closeOutletDialog);
    document.getElementById("cancelOutletModal").addEventListener("click", closeOutletDialog);
    outletModal.addEventListener("click", event => { if (event.target === outletModal) closeOutletDialog(); });
    document.getElementById("outletSearch").addEventListener("input", filterOutlets);
    document.getElementById("outletStatusFilter").addEventListener("change", filterOutlets);
    document.getElementById("outletSort").addEventListener("change", filterOutlets);
    document.getElementById("clearOutletFilters").addEventListener("click", () => { document.getElementById("outletSearch").value = ""; document.getElementById("outletStatusFilter").value = ""; document.getElementById("outletSort").value = "id-asc"; filterOutlets(); });
    document.getElementById("outletForm").addEventListener("submit", saveOutlet);
    document.getElementById("outletTableBody").addEventListener("click", handleAction);
    loadOutlets();
});

async function loadOutlets() {
    try {
        const response = await window.adminFetch("/Admin/Outlets", { headers: { "X-Requested-With": "XMLHttpRequest", "Accept": "application/json" } });
        const data = await readJson(response);
        if (!response.ok) throw new Error(message(data, "Unable to load outlets."));
        outlets = Array.isArray(data) ? data : data?.data ?? data?.result ?? data?.items ?? [];
        filterOutlets();
    } catch (error) {
        outlets = []; filteredOutlets = []; render(); setState("Unable to load outlets", error.message || "Please check API authorization."); notify(error.message || "Unable to load outlets.", "error");
    }
}

function filterOutlets() {
    const search = document.getElementById("outletSearch").value.trim().toLowerCase(), state = document.getElementById("outletStatusFilter").value;
    filteredOutlets = outlets.filter(item => (!search || [outletId(item), outletCode(item), outletName(item), phone(item), address(item)].join(" ").toLowerCase().includes(search)) && (!state || (state === "active" ? isActive(item) : !isActive(item))));
    filteredOutlets = window.AdminListSort(filteredOutlets, document.getElementById("outletSort").value, outletName, outletId);
    document.getElementById("totalOutlets").textContent = outlets.length;
    document.getElementById("activeOutlets").textContent = outlets.filter(isActive).length;
    document.getElementById("inactiveOutlets").textContent = outlets.filter(item => !isActive(item)).length;
    render();
}

function render() {
    const body = document.getElementById("outletTableBody"), table = document.getElementById("outletTableWrapper");
    document.getElementById("outletResultText").textContent = `${filteredOutlets.length} outlet(s) found.`;
    if (!filteredOutlets.length) { body.innerHTML = ""; table.hidden = true; setState("No Outlets", "No outlet records match the current filter."); return; }
    document.getElementById("outletState").hidden = true; table.hidden = false;
    body.innerHTML = filteredOutlets.map(item => `<tr><td>${displayOutletValue(outletId(item))}<br><small>${displayOutletValue(outletCode(item))}</small></td><td><strong>${displayOutletValue(outletName(item))}</strong></td><td>${displayOutletValue(phone(item))}</td><td>${displayOutletValue(address(item))}</td><td><span class="merchant-status ${isActive(item) ? "active" : "inactive"}">${isActive(item) ? "Active" : "Inactive"}</span></td><td class="text-end"><div class="outlet-action-buttons"><button type="button" class="outlet-action-btn outlet-edit-btn" data-action="edit" data-id="${escapeHtml(outletId(item))}" title="Edit outlet" aria-label="Edit ${escapeHtml(outletName(item))}"><i class="bi bi-pencil-square"></i></button><button type="button" class="outlet-action-btn outlet-delete-btn" data-action="delete" data-id="${escapeHtml(outletId(item))}" title="Delete outlet" aria-label="Delete ${escapeHtml(outletName(item))}"><i class="bi bi-trash3"></i></button></div></td></tr>`).join("");
}

function setState(title, text) { document.getElementById("outletStateTitle").textContent = title; document.getElementById("outletStateText").textContent = text; document.getElementById("outletState").hidden = false; }
function openCreate() { editingOutlet = null; document.getElementById("outletForm").reset(); document.getElementById("outletOriginalId").value = ""; document.getElementById("outletIdDisplay").hidden = true; document.getElementById("outletModalTitle").textContent = "Add Outlet"; document.getElementById("saveOutletButton").textContent = "Create Outlet"; formError(""); openOutletDialog(); }
function handleAction(event) { const button = event.target.closest("button[data-action]"); if (!button) return; const item = outlets.find(row => String(outletId(row)) === button.dataset.id); if (!item) return; button.dataset.action === "edit" ? openEdit(item) : deleteOutlet(item); }
function openEdit(item) { editingOutlet = item; document.getElementById("outletOriginalId").value = outletId(item); field("Code").value = outletCode(item); document.getElementById("outletIdText").textContent = outletCode(item) || outletId(item); document.getElementById("outletIdDisplay").hidden = false; field("Name").value = outletName(item); field("Phone").value = phone(item); field("Address").value = address(item); field("Latitude").value = get(item, ["latitude", "Latitude"], 0); field("Longitude").value = get(item, ["longitude", "Longitude"], 0); field("Status").value = isActive(item) ? "Active" : "Inactive"; document.getElementById("outletModalTitle").textContent = "Edit Outlet"; document.getElementById("saveOutletButton").textContent = "Save Changes"; formError(""); openOutletDialog(); }

async function saveOutlet(event) {
    event.preventDefault(); const name = field("Name").value.trim();
    if (!name) return formError("Outlet name is required.");
    const original = editingOutlet || {};
    const payload = { ...original, Id: editingOutlet ? Number(outletId(editingOutlet)) : 0 };
    setApiField(payload, original, ["outletName", "OutletName", "name", "Name"], "Name", name);
    setApiField(payload, original, ["phone", "Phone", "phone1", "Phone1", "phoneNumber", "PhoneNumber"], "PhoneNumber", field("Phone").value.trim());
    setApiField(payload, original, ["address", "Address"], "Address", field("Address").value.trim());
    setApiField(payload, original, ["latitude", "Latitude"], "Latitude", Number(field("Latitude").value || 0));
    setApiField(payload, original, ["longitude", "Longitude"], "Longitude", Number(field("Longitude").value || 0));
    setApiField(payload, original, ["status", "Status", "accountStatus", "AccountStatus"], "Status", field("Status").value);
    if (!editingOutlet) { payload.Image = ""; payload.ImageByte = ""; }
    const button = document.getElementById("saveOutletButton"); button.disabled = true; button.textContent = "Saving...";
    try { const response = await window.adminFetch(editingOutlet ? "/Admin/EditOutlet" : "/Admin/CreateOutlet", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(payload) }); const data = await readJson(response); if (!response.ok || data?.success === false) throw new Error(message(data, "Unable to save outlet.")); closeOutletDialog(); notify(editingOutlet ? "Outlet updated successfully." : "Outlet created successfully.", "success"); await loadOutlets(); } catch (error) { formError(error.message || "Unable to save outlet."); } finally { button.disabled = false; button.textContent = editingOutlet ? "Save Changes" : "Create Outlet"; }
}

async function deleteOutlet(item) { if (!confirm(`Delete ${outletName(item) || "this outlet"}?`)) return; try { const response = await window.adminFetch(`/Admin/DeleteOutlet?id=${encodeURIComponent(outletId(item))}`, { method: "POST", headers: { "Accept": "application/json" } }); const data = await readJson(response); if (!response.ok || data?.success === false) throw new Error(message(data, "Unable to delete outlet.")); notify("Outlet deleted successfully.", "success"); await loadOutlets(); } catch (error) { notify(error.message || "Unable to delete outlet.", "error"); } }

async function readJson(response) { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return { message: text || `HTTP ${response.status}` }; } }
function message(data, fallback) { return data?.message || data?.title || fallback; }
function notify(text, type) { const box = document.getElementById("outletMessage"); box.textContent = text; box.className = `merchant-message ${type}`; box.hidden = false; setTimeout(() => box.hidden = true, 4000); }
function formError(text) { const box = document.getElementById("outletFormError"); box.textContent = text; box.hidden = !text; }
function setApiField(payload, original, names, defaultName, newValue) { const key = names.find(name => Object.prototype.hasOwnProperty.call(original, name)) ?? defaultName; payload[key] = newValue; }
function openOutletDialog() { outletModal.hidden = false; document.body.classList.add("outlet-dialog-open"); }
function closeOutletDialog() { outletModal.hidden = true; document.body.classList.remove("outlet-dialog-open"); }
