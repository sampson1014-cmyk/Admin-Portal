"use strict";

let versionRows = [], versionRequest = null, versionLoading = false;
const versionValue = (row, ...keys) => { for (const key of keys) { const found = Object.keys(row || {}).find(x => x.toLowerCase() === key.toLowerCase()); if (found && row[found] !== undefined && row[found] !== null) return row[found]; } return ""; };
const versionEscape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const versionPlatform = row => String(versionValue(row, "OperatingSystem", "Platform", "AppType", "DeviceType", "OS", "Type") || "Unknown");
const versionNumber = row => String(versionValue(row, "BuildNumber", "Version", "VersionName", "AppVersion", "CurrentVersion") || "-");
const versionMinimum = row => { const value = versionValue(row, "VersionCode", "MinimumVersion", "MinVersion", "MinimumAppVersion"); return String(value === "" ? "-" : value); };
const versionStatus = row => String(versionValue(row, "Status", "AccountStatus") || "Not reported");

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("versionTableBody").addEventListener("click", event => {
        const button = event.target.closest("[data-edit-version]");
        if (button) editVersion(Number(button.dataset.editVersion));
    });
    document.getElementById("versionEditForm").addEventListener("submit", saveVersion);
    document.getElementById("cancelVersionEdit").addEventListener("click", () => document.getElementById("versionEditor").hidden = true);
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
        versionRows = expandVersionRows(extractVersionArray(data)); populatePlatforms(); updateVersionStats(); renderVersions();
    } catch (error) {
        versionRows = []; populatePlatforms(); updateVersionStats(); renderVersions();
        const message = error.name === "AbortError" ? (timedOut ? "The API did not respond within 20 seconds." : "Loading cancelled.") : error.message || "Unable to load app versions.";
        showVersionEmpty("Versions not loaded", message, true); showVersionMessage(message);
    } finally { clearTimeout(timer); setVersionLoading(false); }
}

function extractVersionArray(data, seen = new Set()) { if (Array.isArray(data)) return data; if (!data || typeof data !== "object" || seen.has(data)) return []; seen.add(data); if (versionValue(data, "AndroidBuildNumber", "IOSBuildNumber") !== "") return [data]; for (const value of Object.values(data)) { if (Array.isArray(value)) return value; const nested = extractVersionArray(value, seen); if (nested.length) return nested; } return []; }
function expandVersionRows(rows) {
    return rows.flatMap(row => {
        const android = versionValue(row, "AndroidBuildNumber"), ios = versionValue(row, "IOSBuildNumber");
        if (android === "" && ios === "") return [row];
        const platforms = [];
        if (android !== "") platforms.push({ ...row, Platform: "Android", Version: android, VersionCode: versionValue(row, "AndroidVersionCode") });
        if (ios !== "") platforms.push({ ...row, Platform: "iOS", Version: ios, VersionCode: versionValue(row, "IOSVersionCode") });
        return platforms;
    });
}
function versionBool(value) { return value === true || value === 1 || /^(true|yes|1|required|force)$/i.test(String(value)); }
function versionDate(row) { return versionValue(row, "UpdateDate", "UpdatedDate", "CreateDate", "CreatedDate", "ReleaseDate"); }
function versionTime(value) { const time = new Date(value).getTime(); return Number.isNaN(time) ? 0 : time; }
function versionForced(row) { return versionBool(versionValue(row, "ForceUpdate", "IsForceUpdate", "RequiredUpdate", "IsRequired")); }

function editVersion(index) {
    const row = versionRows[index];
    if (!row) return;
    const form = document.getElementById("versionEditForm"), source = versionEditSource(row, versionRows);
    for (const key of ["AndroidBuildNumber", "AndroidVersionCode", "IOSBuildNumber", "IOSVersionCode", "Setting"])
        form.elements.namedItem(key).value = versionValue(source, key);
    document.getElementById("versionSaveMessage").textContent = "";
    const editor = document.getElementById("versionEditor");
    editor.hidden = false;
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
}

function versionEditSource(row, rows) {
    if (versionValue(row, "AndroidBuildNumber", "IOSBuildNumber") !== "") return row;
    const android = rows.find(item => /^android$/i.test(versionPlatform(item))), ios = rows.find(item => /^ios$/i.test(versionPlatform(item)));
    const settings = [...new Set(rows.map(item => String(versionValue(item, "Setting"))).filter(value => value !== ""))];
    return {
        AndroidBuildNumber: android ? versionValue(android, "BuildNumber", "Version") : "",
        AndroidVersionCode: android ? versionValue(android, "VersionCode") : "",
        IOSBuildNumber: ios ? versionValue(ios, "BuildNumber", "Version") : "",
        IOSVersionCode: ios ? versionValue(ios, "VersionCode") : "",
        Setting: settings.length === 1 ? settings[0] : ""
    };
}

function versionPayload(form) {
    const payload = {};
    for (const key of ["AndroidBuildNumber", "AndroidVersionCode", "IOSBuildNumber", "IOSVersionCode", "Setting"]) {
        const value = form.elements.namedItem(key).value.trim();
        if (!value) throw new Error("Complete all release fields before saving.");
        if (key.endsWith("VersionCode")) {
            const code = Number(value);
            if (!Number.isInteger(code) || code < 0 || code > 2147483647) throw new Error("Version codes must be non-negative whole numbers.");
            payload[key] = code;
        } else payload[key] = value;
    }
    return payload;
}

async function saveVersion(event) {
    event.preventDefault();
    const form = event.currentTarget, button = document.getElementById("saveVersion"), message = document.getElementById("versionSaveMessage");
    if (button.disabled) return;
    try {
        const payload = versionPayload(form);
        if (!window.confirm("Update the shared Android and iOS release settings? This may affect all members.")) return;
        button.disabled = true;
        message.textContent = "Saving release settings…";
        const response = await window.adminFetch("/Admin/UpdateAppVersion", {
            method: "POST", headers: { "Content-Type": "application/json", "RequestVerificationToken": form.elements.namedItem("__RequestVerificationToken").value }, body: JSON.stringify(payload)
        });
        const data = await readVersionJson(response);
        if (!response.ok || data?.success === false) throw new Error(versionApiMessage(data, "The release update was not confirmed."));
        message.textContent = "Release settings saved.";
        await loadVersions();
    } catch (error) { message.textContent = error.message || "Release settings were not saved."; }
    finally { button.disabled = false; }
}
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
    renderVersionRows();
    const rows = filteredVersions();
    document.querySelectorAll("#versionTableBody tr").forEach((element, index) => {
        const cell = element.lastElementChild;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-sm";
        button.dataset.editVersion = String(versionRows.indexOf(rows[index]));
        button.textContent = "Edit";
        cell.appendChild(button);
        const row = rows[index];
        if (versionValue(row, "ForceUpdate", "IsForceUpdate", "RequiredUpdate", "IsRequired") === "")
            element.children[3].textContent = "Not reported";
    });
    if (!versionRows.some(row => versionValue(row, "ForceUpdate", "IsForceUpdate", "RequiredUpdate", "IsRequired") !== ""))
        document.getElementById("versionRequired").textContent = "—";
    if (versionRows.length && versionRows.every(row => versionStatus(row) === "Not reported"))
        document.getElementById("versionActive").textContent = "—";
}
function renderVersionRows() {
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
