"use strict";

let rewardRows = [];
let rewardRequest = null;
let rewardsLoading = false;
let editingRewardIndex = null;
let deletingRewardIndex = null;

const rewardValue = (row, ...keys) => {
    for (const key of keys) {
        const match = Object.keys(row || {}).find(candidate => candidate.toLowerCase() === key.toLowerCase());
        if (match && row[match] !== undefined && row[match] !== null) return row[match];
    }
    return "";
};
const rewardId = row => Number(rewardValue(row, "Id", "id") || 0);
const rewardName = row => rewardValue(row, "Name", "Title", "RewardId") || "Untitled reward";
const rewardTitle = row => rewardValue(row, "Title");
const rewardPoint = row => Number(rewardValue(row, "Point") || 0);
const rewardCategory = row => rewardValue(row, "Category") || "Uncategorized";
const rewardStatus = row => rewardValue(row, "Status") || "Inactive";
const rewardCreated = row => rewardValue(row, "CreateDate");
const rewardExpires = row => rewardValue(row, "ExpireDate");
const rewardEscape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("refreshRewards").addEventListener("click", () => rewardsLoading ? rewardRequest?.abort() : loadRewards());
    document.getElementById("retryRewards").addEventListener("click", loadRewards);
    document.getElementById("addReward").addEventListener("click", () => openRewardForm());
    document.getElementById("rewardForm").addEventListener("submit", saveReward);
    document.getElementById("confirmDeleteReward").addEventListener("click", deleteReward);
    document.getElementById("exportRewards").addEventListener("click", exportRewards);
    ["rewardSearch", "rewardStatus", "rewardCategory", "rewardSort"].forEach(id => {
        document.getElementById(id).addEventListener(id === "rewardSearch" ? "input" : "change", renderRewards);
    });
    document.getElementById("rewardTableBody").addEventListener("click", event => {
        const edit = event.target.closest("button[data-edit-reward]");
        const remove = event.target.closest("button[data-delete-reward]");
        if (edit) openRewardForm(Number(edit.dataset.editReward));
        if (remove) openDeleteReward(Number(remove.dataset.deleteReward));
    });
    loadRewards();
});

async function loadRewards() {
    rewardRequest?.abort();
    rewardRequest = new AbortController();
    const controller = rewardRequest;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
    setRewardsLoading(true);
    hideRewardMessage();

    try {
        const response = await fetch("/Admin/Rewards", { headers: { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" }, cache: "no-store", signal: controller.signal });
        const data = await readRewardJson(response);
        if (!response.ok || data?.success === false) throw new Error(rewardApiMessage(data, "Unable to load rewards."));
        rewardRows = extractRewardArray(data);
        updateRewardFilters();
        updateRewardSummary();
        renderRewards();
    } catch (error) {
        const message = error.name === "AbortError" ? (timedOut ? "The API did not respond within 20 seconds. Check API authorization and try again." : "Loading cancelled. Select Refresh to try again.") : error.message || "Unable to load rewards.";
        rewardRows = [];
        updateRewardSummary();
        renderRewards();
        showRewardEmpty(timedOut ? "Request timed out" : "Rewards not loaded", message, true);
        showRewardMessage(message, "error");
    } finally {
        clearTimeout(timeout);
        setRewardsLoading(false);
    }
}

function extractRewardArray(data, visited = new Set()) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== "object" || visited.has(data)) return [];
    visited.add(data);
    for (const value of Object.values(data)) {
        if (Array.isArray(value)) return value;
        const nested = extractRewardArray(value, visited);
        if (nested.length) return nested;
    }
    return [];
}

function updateRewardFilters() {
    fillRewardFilter("rewardStatus", "All statuses", rewardRows.map(rewardStatus));
    fillRewardFilter("rewardCategory", "All categories", rewardRows.map(rewardCategory));
}

function fillRewardFilter(id, firstLabel, values) {
    const select = document.getElementById(id);
    const current = select.value;
    const options = [...new Set(values.map(value => String(value).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    select.innerHTML = `<option value="">${firstLabel}</option>` + options.map(value => `<option value="${rewardEscape(value)}">${rewardEscape(value)}</option>`).join("");
    if (options.includes(current)) select.value = current;
}

function updateRewardSummary() {
    const active = rewardRows.filter(row => rewardStatus(row).toLowerCase() === "active").length;
    const average = rewardRows.length ? rewardRows.reduce((sum, row) => sum + rewardPoint(row), 0) / rewardRows.length : 0;
    const now = Date.now();
    const inThirtyDays = now + 30 * 86400000;
    const expiring = rewardRows.filter(row => {
        const date = rewardTimestamp(rewardExpires(row));
        return date > now && date <= inThirtyDays;
    }).length;
    document.getElementById("rewardTotal").textContent = rewardRows.length.toLocaleString();
    document.getElementById("rewardActive").textContent = active.toLocaleString();
    document.getElementById("rewardAveragePoints").textContent = Math.round(average).toLocaleString();
    document.getElementById("rewardExpiring").textContent = expiring.toLocaleString();
}

function visibleRewards() {
    const search = document.getElementById("rewardSearch").value.trim().toLowerCase();
    const status = document.getElementById("rewardStatus").value.toLowerCase();
    const category = document.getElementById("rewardCategory").value.toLowerCase();
    const sort = document.getElementById("rewardSort").value;
    const rows = rewardRows.map((row, index) => ({ row, index })).filter(({ row }) => {
        const haystack = [rewardName(row), rewardTitle(row), rewardValue(row, "SubTitle"), rewardValue(row, "ShortTitle"), rewardCategory(row), rewardValue(row, "Description")].join(" ").toLowerCase();
        return (!status || rewardStatus(row).toLowerCase() === status) && (!category || rewardCategory(row).toLowerCase() === category) && (!search || haystack.includes(search));
    });
    rows.sort((a, b) => {
        if (sort === "points-asc") return rewardPoint(a.row) - rewardPoint(b.row);
        if (sort === "points-desc") return rewardPoint(b.row) - rewardPoint(a.row);
        if (sort === "name") return String(rewardName(a.row)).localeCompare(String(rewardName(b.row)));
        return rewardTimestamp(rewardCreated(b.row)) - rewardTimestamp(rewardCreated(a.row)) || rewardId(b.row) - rewardId(a.row);
    });
    return rows;
}

function renderRewards() {
    const rows = visibleRewards();
    document.getElementById("rewardResultText").textContent = `Showing ${rows.length.toLocaleString()} of ${rewardRows.length.toLocaleString()} rewards`;
    document.getElementById("exportRewards").disabled = rows.length === 0;
    const wrapper = document.getElementById("rewardTableWrapper");
    const body = document.getElementById("rewardTableBody");
    if (!rows.length) {
        wrapper.hidden = true;
        body.innerHTML = "";
        showRewardEmpty(rewardRows.length ? "No matching rewards" : "No rewards yet", rewardRows.length ? "Change or clear the filters to see more rewards." : "Create the first reward for members.");
        return;
    }
    document.getElementById("rewardEmpty").hidden = true;
    wrapper.hidden = false;
    body.innerHTML = rows.map(({ row, index }) => {
        const image = safeRewardImage(rewardValue(row, "Image"));
        const status = String(rewardStatus(row));
        const inactive = status.toLowerCase() !== "active";
        const subtitle = rewardValue(row, "SubTitle", "ShortTitle", "Description") || "No subtitle provided";
        return `<tr><td><div class="reward-product">${image ? `<img src="${rewardEscape(image)}" alt="" />` : '<span><i class="bi bi-gift"></i></span>'}<div><strong>${rewardEscape(rewardName(row))}</strong><small>${rewardEscape(subtitle)}</small></div></div></td><td><span class="reward-category">${rewardEscape(rewardCategory(row))}</span></td><td><strong class="reward-points">${rewardPoint(row).toLocaleString()} pts</strong></td><td><span class="reward-date">${rewardEscape(formatRewardDate(rewardExpires(row), "No expiry"))}</span><small>${expiryLabel(row)}</small></td><td><span class="reward-status ${inactive ? "inactive" : ""}">${rewardEscape(status)}</span></td><td><div class="reward-actions"><button type="button" data-edit-reward="${index}" aria-label="Edit ${rewardEscape(rewardName(row))}"><i class="bi bi-pencil"></i></button><button type="button" class="delete" data-delete-reward="${index}" aria-label="Delete ${rewardEscape(rewardName(row))}"><i class="bi bi-trash3"></i></button></div></td></tr>`;
    }).join("");
}

function openRewardForm(index = null) {
    editingRewardIndex = Number.isInteger(index) ? index : null;
    const row = editingRewardIndex === null ? null : rewardRows[editingRewardIndex];
    document.getElementById("rewardFormModal").classList.toggle("editing", Boolean(row));
    document.getElementById("rewardForm").reset();
    document.getElementById("rewardId").value = row ? rewardId(row) : "";
    document.getElementById("rewardName").value = row ? rewardValue(row, "Name") : "";
    document.getElementById("rewardTitle").value = row ? rewardValue(row, "Title") : "";
    document.getElementById("rewardShortTitle").value = row ? rewardValue(row, "ShortTitle") : "";
    document.getElementById("rewardSubTitle").value = row ? rewardValue(row, "SubTitle") : "";
    document.getElementById("rewardPoint").value = row ? rewardPoint(row) : "";
    document.getElementById("rewardCategoryInput").value = row ? rewardValue(row, "Category") : "";
    document.getElementById("rewardStatusInput").value = row && rewardStatus(row).toLowerCase() !== "active" ? "Inactive" : "Active";
    document.getElementById("rewardImage").value = row ? rewardValue(row, "Image") : "";
    document.getElementById("rewardCreateDate").value = row ? rewardDateInput(rewardCreated(row)) : rewardDateInput(new Date());
    document.getElementById("rewardExpireDate").value = row ? rewardDateInput(rewardExpires(row)) : "";
    document.getElementById("rewardDescription").value = row ? rewardValue(row, "Description") : "";
    const descriptionIosField = document.getElementById("rewardDescriptionIos");
    if (descriptionIosField) descriptionIosField.value = row ? rewardValue(row, "DescriptionIOS") : "";
    document.getElementById("rewardTnc").value = row ? rewardValue(row, "TnC") : "";
    document.getElementById("rewardFormEyebrow").textContent = row ? "Update reward" : "New reward";
    document.getElementById("rewardFormTitle").textContent = row ? `Edit ${rewardName(row)}` : "Create a new reward";
    document.querySelector("#saveReward span:last-child").textContent = row ? "Save changes" : "Create reward";
    document.getElementById("rewardFormError").hidden = true;
    bootstrap.Modal.getOrCreateInstance(document.getElementById("rewardFormModal")).show();
}

async function saveReward(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const errorBox = document.getElementById("rewardFormError");
    errorBox.hidden = true;
    if (!form.checkValidity()) {
        const invalidField = form.querySelector(":invalid");
        errorBox.textContent = invalidField?.id === "rewardName"
            ? "Enter a reward name."
            : invalidField?.id === "rewardPoint"
                ? "Enter the points required using 0 or a positive number."
                : "Complete the required fields before saving.";
        errorBox.hidden = false;
        invalidField?.focus();
        invalidField?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
    }
    const row = editingRewardIndex === null ? null : rewardRows[editingRewardIndex];
    const description = document.getElementById("rewardDescription").value.trim();
    const descriptionIos = document.getElementById("rewardDescriptionIos")?.value.trim() || "";
    const payload = {
        ...(row || {}),
        Name: document.getElementById("rewardName").value.trim(),
        Title: document.getElementById("rewardTitle").value.trim(),
        ShortTitle: document.getElementById("rewardShortTitle").value.trim(),
        SubTitle: document.getElementById("rewardSubTitle").value.trim(),
        Point: Number(document.getElementById("rewardPoint").value),
        Category: document.getElementById("rewardCategoryInput").value.trim(),
        Status: document.getElementById("rewardStatusInput").value,
        Image: document.getElementById("rewardImage").value.trim(),
        ImageByte: row ? rewardValue(row, "ImageByte") : "",
        CreateDate: rewardIsoDate(document.getElementById("rewardCreateDate").value),
        ExpireDate: rewardIsoDate(document.getElementById("rewardExpireDate").value),
        Description: description,
        DescriptionIOS: descriptionIos || description || "No description provided.",
        TnC: document.getElementById("rewardTnc").value.trim()
    };
    if (row) payload.Id = rewardId(row);
    const button = document.getElementById("saveReward");
    setRewardButtonBusy(button, true, row ? "Saving..." : "Creating...");
    try {
        const response = await fetch(row ? "/Admin/EditReward" : "/Admin/CreateReward", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(payload) });
        const data = await readRewardJson(response);
        if (!response.ok || data?.success === false) throw new Error(rewardApiMessage(data, `Unable to ${row ? "update" : "create"} the reward.`));
        bootstrap.Modal.getInstance(document.getElementById("rewardFormModal"))?.hide();
        await loadRewards();
        showRewardMessage(`Reward ${row ? "updated" : "created"} successfully.`, "success");
    } catch (error) {
        const message = error.message || "Unable to save the reward.";
        errorBox.textContent = /Failed to fetch|404|not found/i.test(message)
            ? "The running server does not have the latest reward actions. Restart the project, sign in again, and retry."
            : message;
        errorBox.hidden = false;
    } finally {
        setRewardButtonBusy(button, false, row ? "Save changes" : "Create reward");
    }
}

function openDeleteReward(index) {
    deletingRewardIndex = index;
    const row = rewardRows[index];
    if (!row) return;
    document.getElementById("rewardDeleteName").textContent = rewardName(row);
    document.getElementById("rewardDeleteError").hidden = true;
    bootstrap.Modal.getOrCreateInstance(document.getElementById("rewardDeleteModal")).show();
}

async function deleteReward() {
    const row = rewardRows[deletingRewardIndex];
    if (!row) return;
    const button = document.getElementById("confirmDeleteReward");
    const errorBox = document.getElementById("rewardDeleteError");
    setRewardButtonBusy(button, true, "Deleting...");
    errorBox.hidden = true;
    try {
        const type = String(rewardValue(row, "Type") || "");
        const externalId = String(rewardValue(row, "RewardId") || "");
        const endpointType = type.toLowerCase() === "voucher" || externalId.toLowerCase().startsWith("voucher-")
            ? "Voucher"
            : type.toLowerCase() === "reward" || externalId.toLowerCase().startsWith("reward-")
                ? "Reward"
                : "Invalid";
        const response = await fetch(`/Admin/DeleteReward?id=${encodeURIComponent(rewardId(row))}&type=${encodeURIComponent(endpointType)}`, { method: "POST", headers: { "Accept": "application/json", "Content-Type": "application/json" }, body: JSON.stringify(row) });
        const data = await readRewardJson(response);
        if (!response.ok || data?.success === false) throw new Error(rewardApiMessage(data, "Unable to delete the reward."));
        bootstrap.Modal.getInstance(document.getElementById("rewardDeleteModal"))?.hide();
        await loadRewards();
        showRewardMessage("Reward deleted successfully.", "success");
    } catch (error) {
        errorBox.textContent = error.message || "Unable to delete the reward.";
        errorBox.hidden = false;
    } finally {
        setRewardButtonBusy(button, false, "Delete reward");
    }
}

function exportRewards() {
    const rows = visibleRewards();
    if (!rows.length) return;
    const table = [["ID", "Name", "Title", "Category", "Points", "Status", "Created", "Expires"], ...rows.map(({ row }) => [rewardId(row), rewardName(row), rewardTitle(row), rewardCategory(row), rewardPoint(row), rewardStatus(row), rewardCreated(row), rewardExpires(row)])];
    const csv = table.map(columns => columns.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    link.download = `rewards-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

function rewardTimestamp(value) {
    if (!value) return 0;
    const dotNet = /\/Date\((\d+)(?:[+-]\d+)?\)\//.exec(String(value));
    if (dotNet) return Number(dotNet[1]);
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
}

function formatRewardDate(value, fallback = "-") {
    const timestamp = rewardTimestamp(value);
    return timestamp ? new Date(timestamp).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" }) : fallback;
}

function rewardDateInput(value) {
    const timestamp = value instanceof Date ? value.getTime() : rewardTimestamp(value);
    if (!timestamp) return "";
    const date = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60000);
    return date.toISOString().slice(0, 16);
}

function rewardIsoDate(value) { return value ? new Date(value).toISOString() : null; }
function expiryLabel(row) { const time = rewardTimestamp(rewardExpires(row)); if (!time) return "No expiry date"; if (time < Date.now()) return "Expired"; const days = Math.ceil((time - Date.now()) / 86400000); return days <= 30 ? `${days} days remaining` : "Expiry date"; }
function safeRewardImage(value) { const image = String(value || "").trim(); return /^(https?:\/\/|data:image\/)/i.test(image) ? image : ""; }

function setRewardsLoading(show) {
    rewardsLoading = show;
    document.getElementById("rewardLoading").hidden = !show;
    const button = document.getElementById("refreshRewards");
    button.querySelector("span").textContent = show ? "Cancel" : "Refresh";
    button.querySelector("i").className = show ? "bi bi-x-lg" : "bi bi-arrow-clockwise";
    if (show) { document.getElementById("rewardTableWrapper").hidden = true; document.getElementById("rewardEmpty").hidden = true; document.getElementById("exportRewards").disabled = true; }
}

function setRewardButtonBusy(button, busy, label) { button.disabled = busy; button.querySelector(".spinner-border").hidden = !busy; button.querySelector("span:last-child").textContent = label; }
function showRewardEmpty(title, text, retry = false) { document.getElementById("rewardEmptyTitle").textContent = title; document.getElementById("rewardEmptyText").textContent = text; document.getElementById("retryRewards").hidden = !retry; document.getElementById("rewardEmpty").hidden = false; }
function showRewardMessage(text, type) { const box = document.getElementById("rewardMessage"); box.textContent = text; box.className = `reward-message ${type || ""}`; box.hidden = false; }
function hideRewardMessage() { document.getElementById("rewardMessage").hidden = true; }
async function readRewardJson(response) { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return { message: text || `HTTP ${response.status}` }; } }
function rewardApiMessage(data, fallback) { if (data?.errors) return Object.values(data.errors).flat().join(" "); return data?.message || data?.title || fallback; }
