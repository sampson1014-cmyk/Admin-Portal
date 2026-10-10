"use strict";

let feedbackRows = [];
let feedbackRequest = null;
let feedbackLoading = false;
let feedbackPage = 1;

const feedbackId = row => row?.Id ?? row?.id ?? "";
const feedbackTitle = row => row?.Title ?? row?.title ?? "Untitled feedback";
const feedbackCategory = row => row?.Category ?? row?.category ?? "Uncategorized";
const feedbackDescription = row => row?.Description ?? row?.description ?? "";
const feedbackLocation = row => row?.Location ?? row?.location ?? "";
const feedbackRating = row => {
    const raw = row?.Rating ?? row?.rating;
    if (typeof raw !== "number" && typeof raw !== "string") return null;
    if (typeof raw === "string" && !/^\d+(?:\.\d+)?$/.test(raw.trim())) return null;
    const rating = Number(raw);
    return Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null;
};
const feedbackRatingLabel = rating => rating === null ? "Not rated" : rating.toFixed(1);
function compareFeedbackRatings(a, b, descending) {
    const left = feedbackRating(a), right = feedbackRating(b);
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    return descending ? right - left : left - right;
}
const feedbackUser = row => row?.UserId ?? row?.userId ?? "";
const feedbackHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("refreshFeedback").addEventListener("click", () => feedbackLoading ? feedbackRequest?.abort() : loadFeedback());
    document.getElementById("retryFeedback").addEventListener("click", loadFeedback);
    ["feedbackSearch", "feedbackCategory", "feedbackRating", "feedbackSort"].forEach(id => {
        document.getElementById(id).addEventListener(id === "feedbackSearch" ? "input" : "change", () => {
            feedbackPage = 1;
            renderFeedback();
        });
    });
    document.getElementById("feedbackPageSize")?.addEventListener("change", () => {
        feedbackPage = 1;
        renderFeedback();
    });
    document.getElementById("feedbackPrevious")?.addEventListener("click", () => {
        if (feedbackPage > 1) {
            feedbackPage--;
            renderFeedback();
        }
    });
    document.getElementById("feedbackNext")?.addEventListener("click", () => {
        const pageSize = Number(document.getElementById("feedbackPageSize")?.value || 10);
        const pageCount = Math.max(1, Math.ceil(visibleFeedback().length / pageSize));
        if (feedbackPage < pageCount) {
            feedbackPage++;
            renderFeedback();
        }
    });
    document.getElementById("exportFeedback").addEventListener("click", exportFeedback);
    document.getElementById("feedbackTableBody").addEventListener("click", event => {
        const button = event.target.closest("button[data-feedback-index]");
        if (button) showFeedbackDetails(Number(button.dataset.feedbackIndex));
    });
    document.getElementById("feedbackRatingBreakdown")?.addEventListener("click", event => {
        const button = event.target.closest("button[data-rating]");
        if (!button) return;
        const select = document.getElementById("feedbackRating");
        select.value = select.value === button.dataset.rating ? "" : button.dataset.rating;
        feedbackPage = 1;
        updateRatingSelection();
        renderFeedback();
        document.querySelector(".feedback-card").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    loadFeedback();
});

async function loadFeedback() {
    feedbackRequest?.abort();
    feedbackRequest = new AbortController();
    const controller = feedbackRequest;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
    setFeedbackLoading(true);
    hideFeedbackMessage();

    try {
        const response = await fetch("/Admin/Feedback", { headers: { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" }, cache: "no-store", signal: controller.signal });
        const data = await readFeedbackJson(response);
        if (!response.ok || data?.success === false) throw new Error(feedbackApiMessage(data, "Unable to load member feedback."));
        feedbackRows = extractFeedbackArray(data);
        updateFeedbackCategories();
        updateFeedbackSummary();
        renderFeedback();
    } catch (error) {
        const message = error.name === "AbortError" ? (timedOut ? "The API did not respond within 20 seconds. Check API authorization and try again." : "Loading cancelled. Select Refresh to try again.") : error.message || "Unable to load member feedback.";
        feedbackRows = [];
        updateFeedbackSummary();
        document.getElementById("feedbackTableWrapper").hidden = true;
        const pagination = document.getElementById("feedbackPagination");
        if (pagination) pagination.hidden = true;
        document.getElementById("feedbackErrorTitle").textContent = timedOut ? "Request timed out" : "Feedback not loaded";
        document.getElementById("feedbackErrorText").textContent = message;
        document.getElementById("feedbackError").hidden = false;
        showFeedbackMessage(message);
    } finally {
        clearTimeout(timeout);
        setFeedbackLoading(false);
    }
}

function extractFeedbackArray(data, visited = new Set()) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== "object" || visited.has(data)) return [];
    visited.add(data);
    for (const value of Object.values(data)) {
        if (Array.isArray(value)) return value;
        const nested = extractFeedbackArray(value, visited);
        if (nested.length) return nested;
    }
    return [];
}

function updateFeedbackCategories() {
    const categories = [...new Set(feedbackRows.map(feedbackCategory).filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b));
    document.getElementById("feedbackCategory").innerHTML = '<option value="">All categories</option>' + categories.map(category => `<option value="${feedbackHtml(category)}">${feedbackHtml(category)}</option>`).join("");
}

function updateFeedbackSummary() {
    const ratings = feedbackRows.map(feedbackRating).filter(rating => rating !== null);
    const average = ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0;
    document.getElementById("feedbackTotal").textContent = feedbackRows.length.toLocaleString();
    document.getElementById("feedbackAverage").textContent = average.toFixed(1);
    const inlineAverage = document.getElementById("feedbackAverageInline");
    const inlineStars = document.getElementById("feedbackAverageStars");
    const ratingCount = document.getElementById("feedbackRatingCount");
    if (inlineAverage) inlineAverage.textContent = average.toFixed(1);
    if (inlineStars) inlineStars.innerHTML = ratingStars(average);
    if (ratingCount) ratingCount.textContent = ratings.length.toLocaleString();
    document.getElementById("feedbackFiveStar").textContent = ratings.filter(rating => rating === 5).length.toLocaleString();
    document.getElementById("feedbackCategories").textContent = new Set(feedbackRows.map(feedbackCategory).filter(Boolean).map(value => String(value).toLowerCase())).size.toLocaleString();
    const breakdown = document.getElementById("feedbackRatingBreakdown");
    if (breakdown) {
        breakdown.innerHTML = [5, 4, 3, 2, 1].map(star => {
            const count = ratings.filter(rating => Math.round(rating) === star).length;
            const percent = ratings.length ? (count / ratings.length) * 100 : 0;
            return `<button type="button" data-rating="${star}" aria-label="Filter by ${star} star feedback"><span class="feedback-rating-label">${star} <i class="bi bi-star-fill"></i></span><span class="feedback-rating-track"><span style="width:${percent.toFixed(1)}%"></span></span><strong>${count}</strong><small>${percent.toFixed(0)}%</small></button>`;
        }).join("");
    }
    updateRatingSelection();
}

function updateRatingSelection() {
    const selected = document.getElementById("feedbackRating").value;
    document.querySelectorAll("#feedbackRatingBreakdown button[data-rating]").forEach(button => {
        const active = selected === button.dataset.rating;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });
}

function visibleFeedback() {
    const search = document.getElementById("feedbackSearch").value.trim().toLowerCase();
    const category = document.getElementById("feedbackCategory").value.toLowerCase();
    const rating = Number(document.getElementById("feedbackRating").value || 0);
    const sort = document.getElementById("feedbackSort").value;
    const rows = feedbackRows.map((row, index) => ({ row, index })).filter(({ row }) => {
        const matchesCategory = !category || String(feedbackCategory(row)).toLowerCase() === category;
        const matchesRating = !rating || Math.round(feedbackRating(row)) === rating;
        const text = [feedbackTitle(row), feedbackDescription(row), feedbackCategory(row), feedbackLocation(row), feedbackUser(row), feedbackId(row)].join(" ").toLowerCase();
        return matchesCategory && matchesRating && (!search || text.includes(search));
    });
    rows.sort((a, b) => {
        if (sort === "rating-desc") return compareFeedbackRatings(a.row, b.row, true);
        if (sort === "rating-asc") return compareFeedbackRatings(a.row, b.row, false);
        if (sort === "title-asc") return String(feedbackTitle(a.row)).localeCompare(String(feedbackTitle(b.row)));
        return Number(feedbackId(b.row)) - Number(feedbackId(a.row));
    });
    return rows;
}

function renderFeedback() {
    updateRatingSelection();
    const filteredRows = visibleFeedback();
    const pageSize = Number(document.getElementById("feedbackPageSize")?.value || Math.max(filteredRows.length, 10));
    const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    feedbackPage = Math.min(feedbackPage, pageCount);
    const start = (feedbackPage - 1) * pageSize;
    const rows = filteredRows.slice(start, start + pageSize);
    document.getElementById("feedbackResultText").textContent = filteredRows.length
        ? `Showing ${(start + 1).toLocaleString()}-${(start + rows.length).toLocaleString()} of ${filteredRows.length.toLocaleString()} entries`
        : `Showing 0 of ${feedbackRows.length.toLocaleString()} entries`;
    document.getElementById("exportFeedback").disabled = filteredRows.length === 0;
    const body = document.getElementById("feedbackTableBody");
    const wrapper = document.getElementById("feedbackTableWrapper");
    const pagination = document.getElementById("feedbackPagination");
    document.getElementById("feedbackError").hidden = true;
    wrapper.hidden = false;
    if (pagination) pagination.hidden = filteredRows.length === 0;
    const pageText = document.getElementById("feedbackPageText");
    const previous = document.getElementById("feedbackPrevious");
    const next = document.getElementById("feedbackNext");
    if (pageText) pageText.textContent = `Page ${feedbackPage} of ${pageCount}`;
    if (previous) previous.disabled = feedbackPage <= 1;
    if (next) next.disabled = feedbackPage >= pageCount;
    if (!rows.length) {
        body.innerHTML = `<tr class="feedback-empty-row"><td colspan="7"><i class="bi bi-chat-square-text"></i><strong>${feedbackRows.length ? "No matching feedback" : "No feedback yet"}</strong><span>${feedbackRows.length ? "Change or clear the filters to see more results." : "New member feedback will appear here."}</span></td></tr>`;
        return;
    }
    body.innerHTML = rows.map(({ row, index }) => {
        const user = feedbackUser(row);
        const initial = String(user || "M").trim().charAt(0).toUpperCase();
        const rating = feedbackRating(row);
        const ratingLabel = rating === null ? "Not rated" : `${rating} out of 5 stars`;
        return `<tr><td><span class="feedback-id">#${feedbackHtml(feedbackId(row))}</span></td><td><strong class="feedback-title">${feedbackHtml(feedbackTitle(row))}</strong><span class="feedback-preview">${feedbackHtml(feedbackDescription(row) || "No description")}</span></td><td><span class="feedback-category">${feedbackHtml(feedbackCategory(row))}</span></td><td><div class="feedback-member"><span>${feedbackHtml(initial)}</span><div><strong>${user ? `Member ${feedbackHtml(user)}` : "Unknown member"}</strong><small>User ID</small></div></div></td><td><span class="feedback-location"><i class="bi bi-geo-alt"></i>${feedbackHtml(feedbackLocation(row) || "Not provided")}</span></td><td><span class="feedback-stars" aria-label="${ratingLabel}">${ratingStars(rating)}</span><small>${feedbackRatingLabel(rating)}</small></td><td><button type="button" class="feedback-view" data-feedback-index="${index}"><i class="bi bi-eye"></i> View</button></td></tr>`;
    }).join("");
}

function ratingStars(rating) {
    const rounded = Number.isFinite(rating) ? Math.max(0, Math.min(5, Math.round(rating))) : 0;
    return '<i class="bi bi-star-fill"></i>'.repeat(rounded) + '<i class="bi bi-star"></i>'.repeat(5 - rounded);
}

function showFeedbackDetails(index) {
    const row = feedbackRows[index];
    if (!row) return;
    document.getElementById("feedbackDetailsTitle").textContent = feedbackTitle(row);
    document.getElementById("feedbackDetailsCategory").textContent = feedbackCategory(row);
    const rating = feedbackRating(row);
    document.getElementById("feedbackDetailsRating").innerHTML = `${ratingStars(rating)}<strong>${feedbackRatingLabel(rating)}${rating === null ? "" : " / 5"}</strong>`;
    document.getElementById("feedbackDetailsDescription").textContent = feedbackDescription(row) || "No description was provided.";
    document.getElementById("feedbackDetailsId").textContent = feedbackId(row) || "-";
    document.getElementById("feedbackDetailsUser").textContent = feedbackUser(row) || "-";
    document.getElementById("feedbackDetailsLocation").textContent = feedbackLocation(row) || "-";
    bootstrap.Modal.getOrCreateInstance(document.getElementById("feedbackDetailsModal")).show();
}

function exportFeedback() {
    const rows = visibleFeedback();
    if (!rows.length) return;
    const data = [["ID", "Title", "Category", "Description", "Location", "Rating", "User ID"], ...rows.map(({ row }) => [feedbackId(row), feedbackTitle(row), feedbackCategory(row), feedbackDescription(row), feedbackLocation(row), feedbackRating(row), feedbackUser(row)])];
    const csv = data.map(columns => columns.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    link.download = `feedback-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

function setFeedbackLoading(show) { feedbackLoading = show; document.getElementById("feedbackLoading").hidden = !show; const button = document.getElementById("refreshFeedback"); button.querySelector("span").textContent = show ? "Cancel" : "Refresh"; button.querySelector("i").className = show ? "bi bi-x-lg" : "bi bi-arrow-clockwise"; button.setAttribute("aria-label", show ? "Cancel loading feedback" : "Refresh feedback"); if (show) { document.getElementById("feedbackTableWrapper").hidden = true; const pagination = document.getElementById("feedbackPagination"); if (pagination) pagination.hidden = true; document.getElementById("feedbackError").hidden = true; document.getElementById("exportFeedback").disabled = true; } }
function showFeedbackMessage(text) { const box = document.getElementById("feedbackMessage"); box.textContent = text; box.hidden = false; }
function hideFeedbackMessage() { document.getElementById("feedbackMessage").hidden = true; }
async function readFeedbackJson(response) { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return { message: text || `HTTP ${response.status}` }; } }
function feedbackApiMessage(data, fallback) { if (data?.errors) return Object.values(data.errors).flat().join(" "); return data?.message || data?.title || fallback; }
