"use strict";

let orderRows = [];
let orderRequest = null;
let ordersLoading = false;

const orderKey = value => String(value ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
const orderEntries = row => row && typeof row === "object" ? Object.entries(row) : [];
const orderHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

function orderPick(row, keys, fallback = "") {
    const wanted = new Set(keys.map(orderKey));
    const match = orderEntries(row).find(([key, value]) => wanted.has(orderKey(key)) && value !== undefined && value !== null && value !== "");
    return match ? match[1] : fallback;
}

const orderId = row => orderPick(row, ["orderId", "deliveryOrderId", "deliveryId", "bookingId", "id"]);
const orderDate = row => orderPick(row, ["orderDate", "createdDate", "createdAt", "deliveryDate", "bookingDate", "date", "registerTime"]);
const orderMember = row => orderPick(row, ["memberName", "customerName", "name", "memberId", "phoneNumber", "memberPhone", "email"]);
const orderAddress = row => orderPick(row, ["deliveryAddress", "fullAddress", "address", "memberAddress", "destinationAddress"]);
const orderAmount = row => orderPick(row, ["totalAmount", "orderAmount", "amount", "grandTotal", "totalPrice", "deliveryFee", "price"], 0);
const orderStatusValue = row => orderPick(row, ["orderStatus", "deliveryStatus", "status", "bookingStatus", "isPaid"], "Pending");

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("refreshOrders").addEventListener("click", () => ordersLoading ? orderRequest?.abort() : loadOrders());
    document.getElementById("retryOrders").addEventListener("click", loadOrders);
    document.getElementById("orderSearch").addEventListener("input", renderOrders);
    document.getElementById("orderStatus").addEventListener("change", renderOrders);
    document.getElementById("orderSort").addEventListener("change", renderOrders);
    document.getElementById("exportOrders").addEventListener("click", exportOrders);
    document.getElementById("orderTableBody").addEventListener("click", event => {
        const button = event.target.closest("button[data-order-index]");
        if (button) showOrderDetails(Number(button.dataset.orderIndex));
    });
    loadOrders();
});

async function loadOrders() {
    orderRequest?.abort();
    orderRequest = new AbortController();
    const controller = orderRequest;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
    setOrderLoading(true);
    hideOrderMessage();

    try {
        const response = await fetch("/Admin/Orders", { headers: { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" }, cache: "no-store", signal: controller.signal });
        const data = await readOrderJson(response);
        if (!response.ok || data?.success === false) throw new Error(orderApiMessage(data, "Unable to load delivery orders."));
        orderRows = extractOrderArray(data);
        updateOrderStatusOptions();
        updateOrderSummary();
        renderOrders();
    } catch (error) {
        const message = error.name === "AbortError" ? (timedOut ? "The API did not respond within 20 seconds. Check API authorization and try again." : "Loading cancelled. Select Refresh to try again.") : error.message || "Unable to load delivery orders.";
        orderRows = [];
        updateOrderSummary();
        renderOrders();
        document.getElementById("orderTableWrapper").hidden = true;
        showOrderEmpty(timedOut ? "Request timed out" : "Orders not loaded", message, true);
        showOrderMessage(message);
    } finally {
        clearTimeout(timeout);
        setOrderLoading(false);
    }
}

function extractOrderArray(data, visited = new Set()) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== "object" || visited.has(data)) return [];
    visited.add(data);
    const entries = Object.entries(data);
    for (const preferred of ["data", "result", "items", "list", "orders", "records", "rows", "value"]) {
        const match = entries.find(([key]) => orderKey(key) === preferred);
        if (!match) continue;
        if (Array.isArray(match[1])) return match[1];
        const nested = extractOrderArray(match[1], visited);
        if (nested.length) return nested;
    }
    for (const [, value] of entries) {
        if (Array.isArray(value)) return value;
        const nested = extractOrderArray(value, visited);
        if (nested.length) return nested;
    }
    return [];
}

function updateOrderStatusOptions() {
    const select = document.getElementById("orderStatus");
    const statuses = [...new Set(orderRows.map(row => String(orderStatusValue(row)).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    select.innerHTML = '<option value="">All statuses</option>' + statuses.map(status => `<option value="${orderHtml(status)}">${orderHtml(status)}</option>`).join("");
}

function updateOrderSummary() {
    const completed = new Set(["completed", "complete", "delivered", "paid", "true"]);
    const pending = new Set(["pending", "processing", "preparing", "in progress", "false"]);
    document.getElementById("orderTotal").textContent = orderRows.length.toLocaleString();
    document.getElementById("orderPending").textContent = orderRows.filter(row => pending.has(String(orderStatusValue(row)).toLowerCase())).length.toLocaleString();
    document.getElementById("orderCompleted").textContent = orderRows.filter(row => completed.has(String(orderStatusValue(row)).toLowerCase())).length.toLocaleString();
    document.getElementById("orderValue").textContent = orderMoney(orderRows.reduce((sum, row) => sum + orderNumber(orderAmount(row)), 0));
}

function visibleOrders() {
    const search = document.getElementById("orderSearch").value.trim().toLowerCase();
    const status = document.getElementById("orderStatus").value.toLowerCase();
    const sort = document.getElementById("orderSort").value;
    const rows = orderRows.map((row, index) => ({ row, index })).filter(({ row }) => {
        const matchesStatus = !status || String(orderStatusValue(row)).toLowerCase() === status;
        const text = [orderId(row), orderDate(row), orderMember(row), orderAddress(row), orderAmount(row), orderStatusValue(row)].join(" ").toLowerCase();
        return matchesStatus && (!search || text.includes(search));
    });
    rows.sort((a, b) => {
        if (sort === "value-desc") return orderNumber(orderAmount(b.row)) - orderNumber(orderAmount(a.row));
        if (sort === "value-asc") return orderNumber(orderAmount(a.row)) - orderNumber(orderAmount(b.row));
        return sort === "date-asc" ? orderTime(orderDate(a.row)) - orderTime(orderDate(b.row)) : orderTime(orderDate(b.row)) - orderTime(orderDate(a.row));
    });
    return rows;
}

function renderOrders() {
    const rows = visibleOrders();
    document.getElementById("orderResultText").textContent = `Showing ${rows.length.toLocaleString()} of ${orderRows.length.toLocaleString()} orders`;
    document.getElementById("exportOrders").disabled = rows.length === 0;
    const body = document.getElementById("orderTableBody");
    const wrapper = document.getElementById("orderTableWrapper");
    if (!rows.length) {
        const filtered = orderRows.length > 0;
        body.innerHTML = `<tr class="order-empty-row"><td colspan="7"><i class="bi bi-bag-x" aria-hidden="true"></i><strong>${filtered ? "No matching orders" : "No delivery orders yet"}</strong><span>${filtered ? "Change or clear the filters to see more results." : "The API is connected and returned 0 records. New delivery bookings will appear here."}</span></td></tr>`;
        document.getElementById("orderEmpty").hidden = true;
        wrapper.hidden = false;
        return;
    }
    document.getElementById("orderEmpty").hidden = true;
    wrapper.hidden = false;
    body.innerHTML = rows.map(({ row, index }) => `<tr><td><span class="order-id">#${orderHtml(orderId(row) || "-")}</span></td><td><span class="order-date">${orderHtml(formatOrderDate(orderDate(row)))}</span></td><td>${orderHtml(orderMember(row) || "-")}</td><td class="order-address">${orderHtml(orderAddress(row) || "-")}</td><td><strong>${orderHtml(orderMoney(orderAmount(row)))}</strong></td><td><span class="order-status ${orderStatusClass(orderStatusValue(row))}">${orderHtml(orderStatusValue(row))}</span></td><td><button type="button" class="order-view" data-order-index="${index}"><i class="bi bi-eye"></i> View</button></td></tr>`).join("");
}

function showOrderDetails(index) {
    const row = orderRows[index];
    if (!row) return;
    document.getElementById("orderDetailsTitle").textContent = `Order #${orderId(row) || "-"}`;
    document.getElementById("orderDetails").innerHTML = orderEntries(row).filter(([, value]) => value !== null && value !== "").map(([key, value]) => `<div><dt>${orderHtml(orderHumanize(key))}</dt><dd>${orderHtml(typeof value === "object" ? JSON.stringify(value, null, 2) : value)}</dd></div>`).join("") || "<p>No additional details were returned by the API.</p>";
    bootstrap.Modal.getOrCreateInstance(document.getElementById("orderDetailsModal")).show();
}

function orderTime(value) { const dotNet = /\/Date\((\d+)(?:[+-]\d+)?\)\//.exec(String(value)); if (dotNet) return Number(dotNet[1]); const time = new Date(value).getTime(); return Number.isNaN(time) ? 0 : time; }
function formatOrderDate(value) { const time = orderTime(value); return time ? new Date(time).toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : value ? String(value) : "-"; }
function orderNumber(value) { const number = Number(String(value ?? "").replace(/[^0-9.-]/g, "")); return Number.isFinite(number) ? number : 0; }
function orderMoney(value) { return `RM ${orderNumber(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function orderStatusClass(value) { const status = String(value).toLowerCase(); return ["completed", "complete", "delivered", "paid", "true"].includes(status) ? "success" : ["cancelled", "canceled", "failed", "rejected"].includes(status) ? "failed" : "pending"; }
function orderHumanize(value) { return String(value).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, letter => letter.toUpperCase()); }

function exportOrders() {
    const rows = visibleOrders();
    if (!rows.length) return;
    const data = [["Order", "Date", "Member", "Delivery address", "Amount", "Status"], ...rows.map(({ row }) => [orderId(row), formatOrderDate(orderDate(row)), orderMember(row), orderAddress(row), orderAmount(row), orderStatusValue(row)])];
    const csv = data.map(columns => columns.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    link.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

function setOrderLoading(show) { ordersLoading = show; document.getElementById("orderLoading").hidden = !show; const button = document.getElementById("refreshOrders"); button.querySelector("span").textContent = show ? "Cancel" : "Refresh"; button.querySelector("i").className = show ? "bi bi-x-lg" : "bi bi-arrow-clockwise"; button.setAttribute("aria-label", show ? "Cancel loading orders" : "Refresh orders"); if (show) { document.getElementById("orderTableWrapper").hidden = true; document.getElementById("orderEmpty").hidden = true; document.getElementById("exportOrders").disabled = true; } }
function showOrderEmpty(title, text, retry = false) { document.getElementById("orderEmptyTitle").textContent = title; document.getElementById("orderEmptyText").textContent = text; document.getElementById("retryOrders").hidden = !retry; document.getElementById("orderEmpty").hidden = false; }
function showOrderMessage(text) { const message = document.getElementById("orderMessage"); message.textContent = text; message.hidden = false; }
function hideOrderMessage() { document.getElementById("orderMessage").hidden = true; }
async function readOrderJson(response) { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return { message: text || `HTTP ${response.status}` }; } }
function orderApiMessage(data, fallback) { if (data?.errors) return Object.values(data.errors).flat().join(" "); return data?.message || data?.title || fallback; }
