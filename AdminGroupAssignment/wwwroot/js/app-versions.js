"use strict";

let versionRows = [], versionRequest = null, versionLoading = false;
const versionValue = (row, ...keys) => { for (const key of keys) { const found = Object.keys(row || {}).find(x => x.toLowerCase() === key.toLowerCase()); if (found && row[found] !== undefined && row[found] !== null) return row[found]; } return ""; };
const versionEscape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const versionPlatform = row => String(versionValue(row, "Platform", "AppType", "DeviceType", "OS", "Type") || "Unknown");
const versionNumber = row => String(versionValue(row, "Version", "VersionName", "AppVersion", "CurrentVersion") || "-");
const versionMinimum = row => String(versionValue(row, "MinimumVersion", "MinVersion", "MinimumAppVersion") || "-");
const versionStatus = row => String(versionValue(row, "Status", "AccountStatus") || "Active");

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("refreshVersions")?.addEventListener("click", () => versionLoading ? versionRequest?.abort() : loadVersions());
    document.getElementById("retryVersions")?.addEventListener("click", loadVersions);
    document.getElementById("exportVersions")?.addEventListener("click", exportVersions);
    ["versionSearch", "versionPlatform", "versionStatus", "versionSort"].forEach(id => document.getElementById(id)?.addEventListener(id === "versionSearch" ? "input" : "change", renderVersions));
    loadVersions();
});

async function loadVersions() {
    versionRequest?.abort(); versionRequest = new AbortController(); const request = versionRequest; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; request.abort(); }, 20000); setVersionLoading(true); hideVersionMessage();
    try {
        const response = await fetch("/Admin/AppVersions", { headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" }, cache: "no-store", signal: request.signal });
        const data = await readVersionJson(response); if (!response.ok || data?.success === false) throw new Error(versionApiMessage(data, "Unable to load app versions."));
        versionRows = extractVersionArray(data); populatePlatforms(); updateVersionStats(); renderVersions();
    } catch (error) {
        versionRows = []; populatePlatforms(); updateVersionStats(); renderVersions();
        const message = error.name === "AbortError" ? (timedOut ? "The API did not respond within 20 seconds." : "Loading cancelled.") : error.message || "Unable to load app versions.";
        showVersionEmpty("Versions not loaded", message, true); showVersionMessage(message);
    } finally { clearTimeout(timer); setVersionLoading(false); }
}

function extractVersionArray(data, seen = new Set()) { if (Array.isArray(data)) return data; if (!data || typeof data !== "object" || seen.has(data)) return []; seen.add(data); for (const value of Object.values(data)) { if (Array.isArray(value)) return value; const nested = extractVersionArray(value, seen); if (nested.length) return nested; } return []; }
function versionBool(value) { return value === true || value === 1 || /^(true|yes|1|required|force)$/i.test(String(value)); }
function versionDate(row) { return versionValue(row, "UpdateDate", "UpdatedDate", "CreateDate", "CreatedDate", "ReleaseDate"); }
function versionTime(value) { const time = new Date(value).getTime(); return Number.isNaN(time) ? 0 : time; }
function versionForced(row) { return versionBool(versionValue(row, "ForceUpdate", "IsForceUpdate", "RequiredUpdate", "IsRequired")); }
function versionLink(row) { const value = String(versionValue(row, "StoreUrl", "StoreLink", "Url", "ExternalLink", "DownloadUrl") || "").trim(); return /^https?:\/\//i.test(value) ? value : ""; }

function populatePlatforms() { const select = document.getElementById("versionPlatform"), selected = select.value; const values = [...new Set(versionRows.map(versionPlatform).filter(Boolean))].sort(); select.innerHTML = '<option value="">All platforms</option>' + values.map(value => `<option value="${versionEscape(value)}">${versionEscape(value)}</option>`).join(""); if (values.includes(selected)) select.value = selected; }
function updateVersionStats() { document.getElementById("versionTotal").textContent = versionRows.length; document.getElementById("versionActive").textContent = versionRows.filter(row => versionStatus(row).toLowerCase() === "active").length; document.getElementById("versionRequired").textContent = versionRows.filter(versionForced).length; document.getElementById("versionPlatforms").textContent = new Set(versionRows.map(versionPlatform)).size; }
function filteredVersions() {
    const search = document.getElementById("versionSearch").value.trim().toLowerCase(), platform = document.getElementById("versionPlatform").value.toLowerCase(), status = document.getElementById("versionStatus").value.toLowerCase(), sort = document.getElementById("versionSort").value;
    const rows = versionRows.filter(row => { const text = [versionPlatform(row), versionNumber(row), versionMinimum(row), versionValue(row, "Description", "Title")].join(" ").toLowerCase(); return (!search || text.includes(search)) && (!platform || versionPlatform(row).toLowerCase() === platform) && (!status || versionStatus(row).toLowerCase() === status); });
    rows.sort((a, b) => sort === "platform" ? versionPlatform(a).localeCompare(versionPlatform(b)) : sort === "version" ? versionNumber(b).localeCompare(versionNumber(a), undefined, { numeric: true }) : versionTime(versionDate(b)) - versionTime(versionDate(a)));
    return rows;
}
function renderVersions() {
    const rows = filteredVersions(), body = document.getElementById("versionTableBody"), wrap = document.getElementById("versionTableWrap"); document.getElementById("versionResultText").textContent = `Showing ${rows.length} of ${versionRows.length} releases`; document.getElementById("exportVersions").disabled = !rows.length;
    if (!rows.length) { wrap.hidden = true; body.innerHTML = ""; showVersionEmpty(versionRows.length ? "No matching versions" : "No versions found", versionRows.length ? "Change or clear the filters." : "The API returned no version records."); return; }
    document.getElementById("versionEmpty").hidden = true; wrap.hidden = false;
    body.innerHTML = rows.map(row => { const platform = versionPlatform(row), active = versionStatus(row).toLowerCase() === "active", forced = versionForced(row), link = versionLink(row); return `<tr><td><div class="platform-cell"><span class="platform-icon"><i class="bi ${/ios|apple/i.test(platform) ? "bi-apple" : /android/i.test(platform) ? "bi-android2" : "bi-phone"}"></i></span><div><strong>${versionEscape(platform)}</strong><small>${versionEscape(versionValue(row, "Title", "Description") || "Application")}</small></div></div></td><td class="version-number">${versionEscape(versionNumber(row))}</td><td>${versionEscape(versionMinimum(row))}</td><td><span class="update-policy ${forced ? "required" : ""}"><i class="bi ${forced ? "bi-exclamation-circle" : "bi-check2-circle"}"></i>${forced ? "Required" : "Optional"}</span></td><td><span class="version-badge ${active ? "" : "inactive"}"><i class="bi bi-circle-fill"></i>${versionEscape(versionStatus(row))}</span></td><td>${versionEscape(formatVersionDate(versionDate(row)))}</td><td>${link ? `<a class="store-link" href="${versionEscape(link)}" target="_blank" rel="noopener" title="Open store link"><i class="bi bi-box-arrow-up-right"></i></a>` : "-"}</td></tr>`; }).join("");
}
function exportVersions() { const rows = filteredVersions(); if (!rows.length) return; const data = [["Platform", "Version", "Minimum Version", "Required Update", "Status", "Updated", "Store Link"], ...rows.map(row => [versionPlatform(row), versionNumber(row), versionMinimum(row), versionForced(row) ? "Yes" : "No", versionStatus(row), versionDate(row), versionLink(row)])]; downloadVersionCsv(data, `app-versions-${new Date().toISOString().slice(0, 10)}.csv`); }
function downloadVersionCsv(rows, name) { const csv = rows.map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n"), link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" })); link.download = name; link.click(); URL.revokeObjectURL(link.href); }
function formatVersionDate(value) { const time = versionTime(value); return time ? new Date(time).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" }) : "-"; }
function setVersionLoading(show) { versionLoading = show; document.getElementById("versionLoading").hidden = !show; const button = document.getElementById("refreshVersions"), label = button?.querySelector("span"), icon = button?.querySelector("i"); if (label) label.textContent = show ? "Cancel" : "Refresh"; if (icon) icon.className = show ? "bi bi-x-lg" : "bi bi-arrow-clockwise"; if (show) { document.getElementById("versionTableWrap").hidden = true; document.getElementById("versionEmpty").hidden = true; } }
function showVersionEmpty(title, text, retry = false) { document.getElementById("versionEmptyTitle").textContent = title; document.getElementById("versionEmptyText").textContent = text; document.getElementById("retryVersions").hidden = !retry; document.getElementById("versionEmpty").hidden = false; }
function showVersionMessage(text) { const box = document.getElementById("versionMessage"); box.textContent = text; box.hidden = false; }
function hideVersionMessage() { document.getElementById("versionMessage").hidden = true; }
async function readVersionJson(response) { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return { message: text || `HTTP ${response.status}` }; } }
function versionApiMessage(data, fallback) { if (data?.errors) return Object.values(data.errors).flat().join(" "); return data?.message || data?.title || fallback; }
