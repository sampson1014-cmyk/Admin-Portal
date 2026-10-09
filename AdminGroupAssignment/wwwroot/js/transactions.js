"use strict";

const transactionTypes = {
    topups: { title: "Top-up Records", valueLabel: "Amount", totalLabel: "Total amount", unit: "RM", valueKeys: ["amount", "totalAmount", "topupAmount", "balance"] },
    spends: { title: "Spend Records", valueLabel: "Amount", totalLabel: "Total spent", unit: "RM", valueKeys: ["amount", "totalAmount", "spendAmount", "paymentAmount"] },
    rewards: { title: "Reward Records", valueLabel: "Points", totalLabel: "Total points", unit: "pts", valueKeys: ["points", "point", "rewardPoint", "redeemPoint", "amount"] },
    vouchers: { title: "Voucher Records", valueLabel: "Value", totalLabel: "Total value", unit: "RM", valueKeys: ["discountAmount", "voucherAmount", "amount", "value"] },
    stamps: { title: "Stamp Records", valueLabel: "Stamps", totalLabel: "Total stamps", unit: "stamps", valueKeys: ["stampCount", "totalStamp", "qty", "amount"] },
    stampassigns: { title: "Stamp Assignments", valueLabel: "Stamps", totalLabel: "Stamps assigned", unit: "stamps", valueKeys: ["stampCount", "totalStamp", "qty", "amount"] },
    stamptransactions: { title: "Stamp Activity", valueLabel: "Stamps", totalLabel: "Stamp activity", unit: "stamps", valueKeys: ["stampCount", "totalStamp", "qty", "amount"] },
    points: { title: "Point Assignments", valueLabel: "Points", totalLabel: "Points assigned", unit: "pts", valueKeys: ["points", "point", "pointBonus", "rewardPoint", "amount"] }
};

const unsuccessfulStatuses = new Set(["failed", "cancelled", "canceled", "inactive", "rejected", "void", "voided"]);
let currentTransactionType = "topups";
let transactionRows = [];
let transactionCache = {};
let activeRequest = null;
let requestSequence = 0;
let transactionsLoading = false;

const normalizedKey = value => String(value ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
const rowEntries = row => row && typeof row === "object" ? Object.entries(row) : [];

function pick(row, keys, fallback = "") {
    const wanted = new Set(keys.map(normalizedKey));
    const match = rowEntries(row).find(([key, value]) => wanted.has(normalizedKey(key)) && value !== undefined && value !== null && value !== "");
    return match ? match[1] : fallback;
}

const dateValue = row => pick(row, ["transactionDate", "createdDate", "createdAt", "date", "topupDate", "spendDate", "registerTime", "updatedDate", "time"]);
const referenceValue = row => pick(row, ["transactionId", "transactionNo", "referenceNo", "refNo", "topupId", "spendId", "rewardId", "voucherId", "stampId", "pointId", "id"]);
const memberValue = row => pick(row, ["memberName", "memberFullName", "name", "memberId", "userId", "phoneNumber", "memberPhone", "email"]);
const descriptionValue = row => pick(row, ["description", "remarks", "rewardName", "voucherName", "stampName", "pointDescription", "paymentMethod", "type"], transactionTypes[currentTransactionType].title);
const amountValue = row => pick(row, transactionTypes[currentTransactionType].valueKeys, 0);
const statusValue = row => pick(row, ["status", "transactionStatus", "accountStatus", "paymentStatus", "isPaid"], "Completed");
const escapeHtml = text => String(text ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("transactionTabs").addEventListener("click", event => {
        const button = event.target.closest("button[data-type]");
        if (button) selectType(button.dataset.type);
    });
    document.getElementById("refreshTransactions").addEventListener("click", refreshTransactions);
    document.getElementById("retryTransactions").addEventListener("click", refreshTransactions);
    document.getElementById("transactionSearch").addEventListener("input", renderTransactions);
    document.getElementById("transactionStatusFilter").addEventListener("change", renderTransactions);
    document.getElementById("transactionSort").addEventListener("change", renderTransactions);
    document.getElementById("exportTransactions").addEventListener("click", exportTransactions);
    document.getElementById("transactionTableBody").addEventListener("click", event => {
        const button = event.target.closest("button[data-record-index]");
        if (button) showDetails(Number(button.dataset.recordIndex));
    });
    applyTypeLabels();
    loadTransactions();
});

function selectType(type) {
    if (!transactionTypes[type] || type === currentTransactionType) return;
    currentTransactionType = type;
    document.querySelectorAll("#transactionTabs button").forEach(button => {
        const selected = button.dataset.type === type;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-selected", String(selected));
    });
    document.getElementById("transactionSearch").value = "";
    document.getElementById("transactionStatusFilter").value = "";
    applyTypeLabels();
    loadTransactions();
}

function applyTypeLabels() {
    const definition = transactionTypes[currentTransactionType];
    document.getElementById("transactionListTitle").textContent = definition.title;
    document.getElementById("transactionValueLabel").textContent = definition.totalLabel;
    document.getElementById("transactionValueHeading").textContent = definition.valueLabel;
}

function refreshTransactions() {
    if (transactionsLoading) {
        activeRequest?.abort();
        return;
    }
    delete transactionCache[currentTransactionType];
    loadTransactions();
}

async function loadTransactions() {
    const requestedType = currentTransactionType;
    const sequence = ++requestSequence;
    activeRequest?.abort();
    activeRequest = new AbortController();
    const controller = activeRequest;
    let timedOut = false;
    const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, 20000);
    transactionRows = [];
    updateSummary();
    showLoading(true);
    hideMessage();

    if (Object.hasOwn(transactionCache, requestedType)) {
        clearTimeout(timeout);
        transactionRows = transactionCache[requestedType];
        finishLoad();
        return;
    }

    try {
        const response = await fetch(`/Admin/TransactionRecords?type=${encodeURIComponent(requestedType)}`, {
            headers: { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" },
            cache: "no-store",
            signal: controller.signal
        });
        const data = await readJson(response);
        if (!response.ok) throw new Error(apiMessage(data, `Unable to load ${transactionTypes[requestedType].title.toLowerCase()}.`));
        if (data?.success === false) throw new Error(apiMessage(data, "The API could not load the records."));
        if (sequence !== requestSequence || requestedType !== currentTransactionType) return;
        transactionRows = extractArray(data);
        transactionCache[requestedType] = transactionRows;
        finishLoad();
    } catch (error) {
        if (sequence !== requestSequence) return;
        const message = error.name === "AbortError"
            ? (timedOut ? "The API did not respond within 20 seconds. Try again or check API authorization." : "Loading cancelled. Select Refresh to try again.")
            : error.message || "Unable to load transaction records.";
        transactionRows = [];
        updateSummary();
        renderTransactions();
        showEmpty(timedOut ? "Request timed out" : "Records not loaded", message, true);
        showMessage(message);
    } finally {
        clearTimeout(timeout);
        if (sequence === requestSequence) showLoading(false);
    }
}

function finishLoad() {
    updateStatusOptions();
    updateSummary();
    renderTransactions();
    showLoading(false);
}

function extractArray(data, visited = new Set()) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== "object" || visited.has(data)) return [];
    visited.add(data);
    const preferredKeys = ["data", "result", "items", "list", "records", "rows", "value"];
    const entries = Object.entries(data);
    for (const preferred of preferredKeys) {
        const match = entries.find(([key]) => normalizedKey(key) === preferred);
        if (!match) continue;
        if (Array.isArray(match[1])) return match[1];
        const nested = extractArray(match[1], visited);
        if (nested.length) return nested;
    }
    for (const [, value] of entries) {
        if (Array.isArray(value)) return value;
        const nested = extractArray(value, visited);
        if (nested.length) return nested;
    }
    return [];
}

function updateStatusOptions() {
    const select = document.getElementById("transactionStatusFilter");
    const previous = select.value;
    const statuses = [...new Set(transactionRows.map(row => String(statusValue(row)).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    select.innerHTML = '<option value="">All statuses</option>' + statuses.map(status => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("");
    if (statuses.includes(previous)) select.value = previous;
}

function updateSummary() {
    document.getElementById("transactionTotal").textContent = transactionRows.length.toLocaleString();
    document.getElementById("transactionCompleted").textContent = transactionRows.filter(row => !unsuccessfulStatuses.has(String(statusValue(row)).toLowerCase())).length.toLocaleString();
    const total = transactionRows.reduce((sum, row) => sum + numericValue(amountValue(row)), 0);
    document.getElementById("transactionValue").textContent = formatValue(total, true);
    document.getElementById("transactionMembers").textContent = new Set(transactionRows.map(memberValue).filter(Boolean).map(value => String(value).toLowerCase())).size.toLocaleString();
}

function filteredRows() {
    const search = document.getElementById("transactionSearch").value.trim().toLowerCase();
    const status = document.getElementById("transactionStatusFilter").value.toLowerCase();
    const sort = document.getElementById("transactionSort").value;
    const visible = transactionRows.map((row, index) => ({ row, index })).filter(({ row }) => {
        const matchesStatus = !status || String(statusValue(row)).toLowerCase() === status;
        const haystack = [dateValue(row), referenceValue(row), memberValue(row), descriptionValue(row), amountValue(row), statusValue(row)].join(" ").toLowerCase();
        return matchesStatus && (!search || haystack.includes(search));
    });
    visible.sort((left, right) => {
        if (sort === "value-desc") return numericValue(amountValue(right.row)) - numericValue(amountValue(left.row));
        if (sort === "value-asc") return numericValue(amountValue(left.row)) - numericValue(amountValue(right.row));
        const leftDate = dateTimestamp(dateValue(left.row));
        const rightDate = dateTimestamp(dateValue(right.row));
        return sort === "date-asc" ? leftDate - rightDate : rightDate - leftDate;
    });
    return visible;
}

function renderTransactions() {
    const visible = filteredRows();
    document.getElementById("transactionResultText").textContent = `Showing ${visible.length.toLocaleString()} of ${transactionRows.length.toLocaleString()} records`;
    document.getElementById("exportTransactions").disabled = visible.length === 0;
    const body = document.getElementById("transactionTableBody");
    const wrapper = document.getElementById("transactionTableWrapper");
    if (!visible.length) {
        body.innerHTML = "";
        wrapper.hidden = true;
        showEmpty(transactionRows.length ? "No matching records" : "No records", transactionRows.length ? "Change or clear the filters to see more results." : "The API returned no records for this transaction type.");
        return;
    }
    document.getElementById("transactionEmpty").hidden = true;
    wrapper.hidden = false;
    body.innerHTML = visible.map(({ row, index }) => {
        const state = String(statusValue(row));
        const stateClass = unsuccessfulStatuses.has(state.toLowerCase()) ? "failed" : "";
        return `<tr><td><span class="transaction-date">${escapeHtml(formatDate(dateValue(row)))}</span></td><td><span class="transaction-reference">${escapeHtml(referenceValue(row) || "-")}</span></td><td>${escapeHtml(memberValue(row) || "-")}</td><td>${escapeHtml(descriptionValue(row) || "-")}</td><td><span class="transaction-value">${escapeHtml(formatValue(amountValue(row)))}</span></td><td><span class="transaction-status ${stateClass}">${escapeHtml(state)}</span></td><td><button type="button" class="transaction-view" data-record-index="${index}" aria-label="View transaction details"><i class="bi bi-eye"></i> View</button></td></tr>`;
    }).join("");
}

function numericValue(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
}

function dateTimestamp(value) {
    if (!value) return 0;
    const dotNet = /\/Date\((\d+)(?:[+-]\d+)?\)\//.exec(String(value));
    if (dotNet) return Number(dotNet[1]);
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDate(value) {
    const timestamp = dateTimestamp(value);
    if (!timestamp) return value ? String(value) : "-";
    return new Date(timestamp).toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatValue(value) {
    const definition = transactionTypes[currentTransactionType];
    const number = typeof value === "number" ? value : numericValue(value);
    if (!Number.isFinite(number)) return String(value || "-");
    const formatted = number.toLocaleString(undefined, { minimumFractionDigits: definition.unit === "RM" ? 2 : 0, maximumFractionDigits: 2 });
    return definition.unit === "RM" ? `RM ${formatted}` : `${formatted} ${definition.unit}`;
}

function showDetails(index) {
    const row = transactionRows[index];
    if (!row) return;
    document.getElementById("transactionDetailsTitle").textContent = String(referenceValue(row) || transactionTypes[currentTransactionType].title);
    const details = document.getElementById("transactionDetails");
    details.innerHTML = rowEntries(row).filter(([, value]) => value !== null && value !== "").map(([key, value]) => {
        const displayValue = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
        return `<div><dt>${escapeHtml(humanize(key))}</dt><dd>${escapeHtml(displayValue)}</dd></div>`;
    }).join("") || "<p>No additional details were returned by the API.</p>";
    bootstrap.Modal.getOrCreateInstance(document.getElementById("transactionDetailsModal")).show();
}

function humanize(value) {
    return String(value).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, letter => letter.toUpperCase());
}

function exportTransactions() {
    const visible = filteredRows();
    if (!visible.length) return;
    const headers = ["Date", "Reference", "Member", "Description", transactionTypes[currentTransactionType].valueLabel, "Status"];
    const records = visible.map(({ row }) => [formatDate(dateValue(row)), referenceValue(row), memberValue(row), descriptionValue(row), amountValue(row), statusValue(row)]);
    const csv = [headers, ...records].map(columns => columns.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${currentTransactionType}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

function csvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function showLoading(show) {
    transactionsLoading = show;
    document.getElementById("transactionLoading").hidden = !show;
    const refresh = document.getElementById("refreshTransactions");
    refresh.disabled = false;
    refresh.querySelector("span").textContent = show ? "Cancel" : "Refresh";
    refresh.querySelector("i").className = show ? "bi bi-x-lg" : "bi bi-arrow-clockwise";
    refresh.setAttribute("aria-label", show ? "Cancel loading transactions" : "Refresh transaction records");
    document.getElementById("transactionResultText").textContent = show ? "Loading records..." : document.getElementById("transactionResultText").textContent;
    if (show) {
        document.getElementById("transactionTableWrapper").hidden = true;
        document.getElementById("transactionEmpty").hidden = true;
        document.getElementById("exportTransactions").disabled = true;
    }
}

function showEmpty(title, text, retry = false) {
    document.getElementById("transactionEmptyTitle").textContent = title;
    document.getElementById("transactionEmptyText").textContent = text;
    document.getElementById("retryTransactions").hidden = !retry;
    document.getElementById("transactionEmpty").hidden = false;
}

function showMessage(text) {
    const box = document.getElementById("transactionMessage");
    box.textContent = text;
    box.hidden = false;
}

function hideMessage() {
    document.getElementById("transactionMessage").hidden = true;
}

async function readJson(response) {
    const text = await response.text();
    try { return text ? JSON.parse(text) : {}; }
    catch { return { message: text || `HTTP ${response.status}` }; }
}

function apiMessage(data, fallback) {
    if (data?.errors) return Object.values(data.errors).flat().join(" ");
    return data?.message || data?.title || fallback;
}
