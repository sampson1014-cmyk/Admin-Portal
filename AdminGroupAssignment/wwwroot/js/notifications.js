"use strict";

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('input[name="audience"]').forEach(input => input.addEventListener("change", updateAudience));
    document.getElementById("notificationTitle").addEventListener("input", updatePreview);
    document.getElementById("notificationBody").addEventListener("input", updatePreview);
    document.getElementById("notificationImage").addEventListener("input", updatePreview);
    document.getElementById("clearNotification").addEventListener("click", clearForm);
    document.getElementById("notificationForm").addEventListener("submit", sendNotification);
    updateAudience(); updatePreview();
});

function selectedAudience() { return document.querySelector('input[name="audience"]:checked').value; }
function updateAudience() { const targeted = selectedAudience() !== "all"; document.getElementById("notificationTargetSection").hidden = !targeted; document.getElementById("notificationTarget").required = targeted; }
function updatePreview() {
    const title = document.getElementById("notificationTitle").value, body = document.getElementById("notificationBody").value, source = document.getElementById("notificationImage").value.trim();
    document.getElementById("titleCount").textContent = title.length; document.getElementById("bodyCount").textContent = body.length;
    document.getElementById("previewTitle").textContent = title || "Notification title"; document.getElementById("previewBody").textContent = body || "Your message will appear here.";
    const previewImage = document.getElementById("previewImage"); previewImage.hidden = !source; if (source) previewImage.src = source;
}

function clearForm() { document.getElementById("notificationForm").reset(); document.querySelector('input[name="audience"][value="all"]').checked = true; hideError(); updateAudience(); updatePreview(); }

async function sendNotification(event) {
    event.preventDefault(); hideError();
    const audience = selectedAudience(), title = document.getElementById("notificationTitle").value.trim(), body = document.getElementById("notificationBody").value.trim(), target = document.getElementById("notificationTarget").value.trim();
    if (!title || !body) return showError("Title and message are required.");
    if (audience !== "all" && !target) return showError("Enter an active device ID.");
    let payload;
    if (audience === "all") {
        payload = { Title: title, Text: body };
    } else {
        payload = { DeviceId: target, Type: "General", TargetId: target, NotificationHeader: title, NotificationBody: body };
    }
    const endpoint = audience === "all" ? "/Admin/SendMemberNotification" : "/Admin/SendNotificationByDevice";
    const button = document.getElementById("sendNotification"); button.disabled = true; button.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';
    try {
        const response = await window.adminFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(payload) });
        const data = await readJson(response);
        if (!response.ok || notificationFailed(data)) throw new Error(apiMessage(data, "Unable to send notification."));
        showMessage("Notification sent successfully.", "success"); clearForm();
    } catch (error) { showError(error.message || "Unable to send notification."); }
    finally { button.disabled = false; button.innerHTML = '<i class="bi bi-send"></i> Send Notification'; }
}

async function readJson(response) { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return { message: text || `HTTP ${response.status}` }; } }
function notificationFailed(data) {
    if (data === false || data === null) return true;
    if (typeof data === "string") return /fail|error|invalid|unable/i.test(data);
    if (data?.success === false || data?.status === false || data?.result === false) return true;
    const statusText = [data?.message, data?.title, data?.status, data?.result].filter(value => typeof value === "string").join(" ");
    return /fail|error|invalid|unable/i.test(statusText);
}
function apiMessage(data, fallback) { if (typeof data === "string" && data.trim()) return data; if (data?.errors) return Object.values(data.errors).flat().join(" "); return data?.message || data?.title || fallback; }
function showMessage(text, type) { const box = document.getElementById("notificationMessage"); box.textContent = text; box.className = `notification-message ${type}`; box.hidden = false; }
function showError(text) { const box = document.getElementById("notificationFormError"); box.textContent = text; box.hidden = false; showMessage(text, "error"); }
function hideError() { document.getElementById("notificationFormError").hidden = true; }
