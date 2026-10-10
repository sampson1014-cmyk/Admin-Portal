"use strict";

let staffRows = [], visibleStaff = [], merchants = [], editingStaff = null;
const value = (item, names, fallback = "") => names.map(name => item?.[name]).find(itemValue => itemValue !== undefined && itemValue !== null) ?? fallback;
const staffId = item => value(item, ["id", "Id"]);
const staffCode = item => value(item, ["staffId", "StaffId", "userId", "UserId"]);
const staffName = item => value(item, ["name", "Name", "staffName", "StaffName", "username", "Username"]);
const staffType = item => value(item, ["staffType", "StaffType", "type", "Type"]);
const merchantId = item => value(item, ["merchantId", "MerchantId"]);
const staffEmail = item => value(item, ["email", "Email"]);
const staffPhone = item => value(item, ["phoneNumber", "PhoneNumber", "phone", "Phone"]);
const staffStatus = item => String(value(item, ["status", "Status", "accountStatus", "AccountStatus"])).trim() || "Not reported";
const isActive = item => ["active", "activated", "enabled"].includes(String(staffStatus(item)).trim().toLowerCase());
const isInactive = item => ["inactive", "deactivated", "disabled"].includes(staffStatus(item).toLowerCase());
const matchesStaffStatus = (item, selected) => !selected || (selected === "active" ? isActive(item) : selected === "inactive" ? isInactive(item) : selected === "unknown" && !isActive(item) && !isInactive(item));
const normalizedPhone = phone => String(phone || "").replace(/\D/g, "");
const escapeHtml = text => String(text ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const displayStaffValue = value => escapeHtml(String(value ?? "").trim() || "Empty");

document.addEventListener("DOMContentLoaded", () => {
    const unknownStatus = document.createElement("option");
    unknownStatus.value = "unknown";
    unknownStatus.textContent = "Not reported / other";
    document.getElementById("staffStatusFilter").appendChild(unknownStatus);
    document.getElementById("refreshStaff").addEventListener("click", loadStaff);
    document.getElementById("addStaffButton").addEventListener("click", () => openStaffForm());
    document.getElementById("closeStaffModal").addEventListener("click", closeStaffForm);
    document.getElementById("cancelStaffModal").addEventListener("click", closeStaffForm);
    document.getElementById("staffModal").addEventListener("click", event => { if (event.target.id === "staffModal") closeStaffForm(); });
    document.getElementById("staffForm").addEventListener("submit", saveStaff);
    ["staffSearch", "staffMerchantFilter", "staffTypeFilter", "staffStatusFilter", "staffSort"].forEach(id => {
        const control = document.getElementById(id);
        control.addEventListener(id === "staffSearch" ? "input" : "change", filterStaff);
    });
    document.getElementById("clearStaffFilters").addEventListener("click", clearStaffFilters);
    document.getElementById("staffTableBody").addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        const item = staffRows.find(row => String(staffId(row)) === button.dataset.staffId);
        if (!item) return;
        if (button.dataset.action === "delete") removeStaff(item);
    });
    initializeStaff();
});

async function initializeStaff() {
    await Promise.all([loadMerchants(), loadStaff()]);
    filterStaff();
}

async function loadMerchants() {
    try {
        const response = await window.adminFetch("/Admin/GetAllMerchants", { headers: { Accept: "application/json" } }), data = await readJson(response);
        if (!response.ok) throw new Error(apiMessage(data, "Unable to load merchants."));
        merchants = toArray(data);
        const options = merchants.map(item => {
            const id = value(item, ["merchantId", "MerchantId", "id", "Id"]), name = value(item, ["merchantName", "MerchantName", "name", "Name"], id);
            return `<option value="${escapeHtml(id)}">${escapeHtml(name)} (${escapeHtml(id)})</option>`;
        }).join("");
        document.getElementById("staffMerchantFilter").innerHTML = `<option value="">All Merchants</option>${options}`;
        document.getElementById("staffMerchantId").innerHTML = `<option value="">Select merchant</option>${options}`;
    } catch (error) { notify(error.message || "Unable to load merchants.", "error", false); }
}

async function loadStaff() {
    try {
        const response = await window.adminFetch("/Admin/Staff", { headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json" } }), data = await readJson(response);
        if (!response.ok) throw new Error(apiMessage(data, "Unable to load staff."));
        staffRows = toArray(data); filterStaff();
    } catch (error) {
        staffRows = []; visibleStaff = []; renderStaff(); setState("Unable to load staff", error.message || "Please check the API connection."); notify(error.message || "Unable to load staff.", "error", false);
    }
}

function toArray(data) { if (Array.isArray(data)) return data; return data?.data ?? data?.result ?? data?.items ?? []; }

function filterStaff() {
    const search = document.getElementById("staffSearch").value.trim().toLowerCase();
    const selectedMerchant = document.getElementById("staffMerchantFilter").value;
    const selectedType = document.getElementById("staffTypeFilter").value.toLowerCase();
    const selectedStatus = document.getElementById("staffStatusFilter").value.toLowerCase();
    visibleStaff = staffRows.filter(item => {
        const searchable = [staffId(item), staffCode(item), staffName(item), staffType(item), merchantLabel(merchantId(item)), staffEmail(item), staffPhone(item)].join(" ").toLowerCase();
        const matchesSearch = !search || searchable.includes(search);
        const matchesMerchant = !selectedMerchant || String(merchantId(item)) === selectedMerchant;
        const matchesType = !selectedType || String(staffType(item)).toLowerCase() === selectedType;
        const matchesStatus = matchesStaffStatus(item, selectedStatus);
        return matchesSearch && matchesMerchant && matchesType && matchesStatus;
    });
    visibleStaff = window.AdminListSort(visibleStaff, document.getElementById("staffSort").value, staffName, staffId);
    document.getElementById("totalStaff").textContent = staffRows.length;
    const reportedStatuses = staffRows.filter(item => isActive(item) || isInactive(item));
    document.getElementById("activeStaff").textContent = reportedStatuses.length ? staffRows.filter(isActive).length : "Not reported";
    document.getElementById("activeStaff").title = `${reportedStatuses.length} of ${staffRows.length} staff records have a recognized status from the API.`;
    document.getElementById("staffMerchantCount").textContent = new Set(staffRows.map(merchantId).filter(Boolean)).size;
    renderStaff();
}

function clearStaffFilters() {
    document.getElementById("staffSearch").value = "";
    document.getElementById("staffMerchantFilter").value = "";
    document.getElementById("staffTypeFilter").value = "";
    document.getElementById("staffStatusFilter").value = "";
    document.getElementById("staffSort").value = "id-asc";
    filterStaff();
}

function renderStaff() {
    const body = document.getElementById("staffTableBody"), wrapper = document.getElementById("staffTableWrapper");
    document.getElementById("staffResultText").textContent = `${visibleStaff.length} of ${staffRows.length} staff member(s) shown.`;
    if (!visibleStaff.length) { body.innerHTML = ""; wrapper.hidden = true; setState("No Staff", staffRows.length ? "No staff records match the current filters." : "No staff records were found."); return; }
    document.getElementById("staffState").hidden = true; wrapper.hidden = false;
    body.innerHTML = visibleStaff.map(item => `<tr><td>${displayStaffValue(staffId(item))}<br><small>${displayStaffValue(staffCode(item))}</small></td><td><strong>${displayStaffValue(staffName(item))}</strong></td><td>${displayStaffValue(staffType(item))}</td><td>${displayStaffValue(merchantLabel(merchantId(item)))}</td><td>${displayStaffValue(staffEmail(item))}<br><small>${displayStaffValue(staffPhone(item))}</small></td><td><span class="merchant-status ${isActive(item) ? "active" : "inactive"}">${escapeHtml(staffStatus(item))}</span></td><td class="text-end"><div class="outlet-action-buttons"><button type="button" class="outlet-action-btn outlet-delete-btn" data-action="delete" data-staff-id="${escapeHtml(staffId(item))}" title="Delete staff"><i class="bi bi-trash3"></i></button></div></td></tr>`).join("");
    body.querySelectorAll('tr').forEach((row, index) => {
        if (!isActive(visibleStaff[index]) && !isInactive(visibleStaff[index])) row.querySelector('.merchant-status').classList.remove('inactive');
    });
}

function merchantLabel(id) {
    const merchant = merchants.find(item => String(value(item, ["merchantId", "MerchantId", "id", "Id"])) === String(id));
    return merchant ? `${value(merchant, ["merchantName", "MerchantName", "name", "Name"], id)} (${id})` : id;
}
function setState(title, text) { document.getElementById("staffStateTitle").textContent = title; document.getElementById("staffStateText").textContent = text; document.getElementById("staffState").hidden = false; }

function openStaffForm(item = null) {
    if (item) { notify("Staff editing is unavailable. No changes were sent.", "error", false); return; }
    editingStaff = null;
    document.getElementById("staffForm").reset(); setFormError("");
    document.getElementById("staffModalTitle").textContent = "Add Staff";
    document.getElementById("saveStaffButton").textContent = "Create Staff";
    document.getElementById("staffMerchantId").value = "";
    document.getElementById("staffType").value = "Staff";
    document.getElementById("staffPhone").readOnly = false;
    document.getElementById("staffModal").hidden = false;
    document.body.classList.add("outlet-dialog-open");
    document.getElementById("staffName").focus();
}

function closeStaffForm() {
    if (document.getElementById("saveStaffButton").disabled) return;
    document.getElementById("staffModal").hidden = true;
    document.getElementById("staffPhone").readOnly = false;
    document.body.classList.remove("outlet-dialog-open");
    editingStaff = null;
}

async function saveStaff(event) {
    event.preventDefault(); setFormError("");
    if (editingStaff) { setFormError("Staff editing is unavailable. No changes were sent."); return; }
    const merchant = document.getElementById("staffMerchantId").value;
    const name = document.getElementById("staffName").value.trim();
    const type = document.getElementById("staffType").value;
    const phone = document.getElementById("staffPhone").value.trim();
    const password = document.getElementById("staffPassword").value;
    if (!name || name.length > 120) { setFormError("Enter a staff name of 1–120 characters."); return; }
    if (!merchant || !phone || !password) { setFormError("Merchant, staff name, phone number, and password are required when creating staff."); return; }
    if (normalizedPhone(phone).length < 7) { setFormError("Enter a valid phone number."); return; }
    if (editingStaff && normalizedPhone(phone) !== normalizedPhone(staffPhone(editingStaff))) { setFormError("The phone number cannot be changed while editing because the API uses it to identify the staff account."); return; }
    if (!editingStaff) {
        const duplicate = staffRows.find(item => normalizedPhone(staffPhone(item)) === normalizedPhone(phone));
        if (duplicate) {
            setFormError(`This phone number already belongs to ${staffName(duplicate) || "another staff member"} (ID ${staffId(duplicate)}). Use a different phone number for a new staff account.`);
            return;
        }
    }

    const payload = { StaffName: name, StaffType: type, Password: password, PhoneNumber: phone, MerchantId: merchant };
    const editing = Boolean(editingStaff), button = document.getElementById("saveStaffButton");
    button.disabled = true; button.textContent = editing ? "Saving..." : "Creating...";
    try {
        const response = await window.adminFetch("/Admin/CreateStaff", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
        const data = await readJson(response);
        if (!response.ok || data?.success === false) throw new Error(apiMessage(data, editing ? "Unable to update staff." : "Unable to create staff."));
        document.getElementById("staffModal").hidden = true; document.body.classList.remove("outlet-dialog-open"); editingStaff = null;
        document.getElementById("staffSearch").value = ""; document.getElementById("staffMerchantFilter").value = merchant;
        await loadStaff();
        notify("Staff created successfully.", "success");
    } catch (error) { setFormError(error.message || (editing ? "Unable to update staff." : "Unable to create staff.")); }
    finally { button.disabled = false; button.textContent = "Create Staff"; }
}

async function removeStaff(item) {
    if (!confirm(`Delete ${staffName(item) || "this staff account"}?`)) return;
    try {
        const response = await window.adminFetch("/Admin/DeleteStaff", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ StaffId: staffCode(item) }) });
        const data = await readJson(response); if (!response.ok || data?.success === false) throw new Error(apiMessage(data, "Unable to delete staff."));
        notify("Staff deleted successfully.", "success"); await loadStaff();
    } catch (error) { notify(error.message || "Unable to delete staff.", "error", false); }
}

async function readJson(response) { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return { message: text || `HTTP ${response.status}` }; } }
function apiMessage(data, fallback) { if (data?.errors) return Object.values(data.errors).flat().join(" "); return data?.message || data?.title || fallback; }
function notify(text, type, autoHide = true) { const box = document.getElementById("staffMessage"); box.textContent = text; box.className = `merchant-message ${type}`; box.hidden = false; if (autoHide) setTimeout(() => box.hidden = true, 4500); }
function setFormError(text) { const box = document.getElementById("staffFormError"); box.textContent = text; box.hidden = !text; }
