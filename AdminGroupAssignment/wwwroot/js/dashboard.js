(function () {
    "use strict";
    const root = document.querySelector(".dash");
    if (!root) return;

    const endpoint = root.dataset.endpoint || "/Admin/DashboardData";
    const loginUrl = root.dataset.login || "/Admin/LoginPage";
    const refreshButton = document.getElementById("refreshBtn");
    const statusDot = document.getElementById("statusDot");
    const statusText = document.getElementById("statusText");
    const lastUpdated = document.getElementById("lastUpdated");
    const errorBox = document.getElementById("errorBox");
    const errorList = document.getElementById("errorList");
    const transactionKeys = ["TopUps", "Spends", "RewardRedemptions", "Vouchers", "StampRecords", "PointAssigns"];
    const transactionColors = ["#315f46", "#7da36f", "#d8a84e", "#be6d52", "#627d98", "#8d72a8"];
    let loading = false;

    function pick(data, key) {
        if (data?.[key] !== undefined && data[key] !== null) return data[key];
        const camel = key.charAt(0).toLowerCase() + key.slice(1);
        return data?.[camel] ?? 0;
    }
    function number(data, key) { const parsed = Number(pick(data, key)); return Number.isFinite(parsed) ? parsed : 0; }
    function format(value) { return Number(value || 0).toLocaleString(); }
    function setStatus(state, text) { statusDot.className = `status-dot${state ? ` ${state}` : ""}`; statusText.textContent = text; }
    function showErrors(errors) {
        const messages = Array.isArray(errors) ? errors.filter(Boolean) : [];
        errorList.replaceChildren(...messages.map(message => { const item = document.createElement("li"); item.textContent = message; return item; }));
        errorBox.hidden = messages.length === 0;
    }
    function setLoading(active) {
        document.querySelectorAll("[data-value], #transactionKpi, #transactionTotal").forEach(element => element.classList.toggle("loading", active));
        refreshButton.disabled = active;
        refreshButton.classList.toggle("is-loading", active);
        refreshButton.querySelector("span").textContent = active ? "Refreshing" : "Refresh";
    }
    function renderBars(data) {
        const rows = [...document.querySelectorAll("[data-chart-key]")];
        const maximum = Math.max(0, ...rows.map(row => number(data, row.dataset.chartKey)));
        rows.forEach(row => {
            const value = number(data, row.dataset.chartKey);
            const width = maximum > 0 ? (value / maximum) * 100 : 0;
            row.querySelector(".chart-track i").style.width = value > 0 ? `${Math.max(width, 4)}%` : "0%";
        });
    }
    function renderDonut(data) {
        const values = transactionKeys.map(key => number(data, key));
        const total = values.reduce((sum, value) => sum + value, 0);
        const donut = document.getElementById("transactionDonut");
        document.getElementById("transactionTotal").textContent = format(total);
        document.getElementById("transactionKpi").textContent = format(total);
        if (!total) { donut.style.background = "conic-gradient(#e9ece8 0 100%)"; return; }
        let cursor = 0;
        const segments = values.map((value, index) => { const start = cursor; cursor += (value / total) * 100; return `${transactionColors[index]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`; });
        donut.style.background = `conic-gradient(${segments.join(",")})`;
    }
    function render(data) {
        document.querySelectorAll("[data-value]").forEach(element => { element.textContent = format(number(data, element.dataset.value)); element.classList.remove("failed"); });
        renderBars(data);
        renderDonut(data);
        const errorsValue = pick(data, "Errors");
        const errors = Array.isArray(errorsValue) ? errorsValue : [];
        showErrors(errors);
        lastUpdated.textContent = pick(data, "LastUpdated") || new Date().toLocaleString();
        if (pick(data, "ApiConnected") === false) setStatus("error", "API unavailable");
        else if (errors.length) setStatus("warning", `Connected with ${errors.length} issue${errors.length === 1 ? "" : "s"}`);
        else setStatus("connected", "All systems connected");
    }
    async function loadDashboard() {
        if (loading) return;
        loading = true; setLoading(true); setStatus("", "Loading dashboard");
        try {
            const response = await window.adminFetch(endpoint, { headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" }, credentials: "same-origin", cache: "no-store" });
            if (response.status === 401) { window.location.href = loginUrl; return; }
            if (!response.ok) throw new Error(`Server returned HTTP ${response.status}.`);
            render(await response.json());
        } catch (error) {
            document.querySelectorAll("[data-value], #transactionKpi, #transactionTotal").forEach(element => { element.textContent = "!"; element.classList.add("failed"); });
            showErrors([error.message || "Unable to load dashboard data."]);
            setStatus("error", "Dashboard unavailable");
        } finally { loading = false; setLoading(false); }
    }

    refreshButton.addEventListener("click", loadDashboard);
    window.setInterval(() => { if (!document.hidden) loadDashboard(); }, 5 * 60 * 1000);
    loadDashboard();
})();
