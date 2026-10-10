(() => {
    "use strict";
    const routes = { members: { phone: "FindMemberByPhone", email: "FindMemberByEmail" }, outlets: { phone: "FindOutletsByPhone" } };
    const escape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    const field = (row, ...names) => { for (const name of names) { const key = Object.keys(row).find(key => key.toLowerCase() === name.toLowerCase()); if (key && row[key] !== null && row[key] !== undefined) return row[key]; } return "—"; };
    function records(data) {
        if (Array.isArray(data)) return data;
        if (!data || typeof data !== "object") return [];
        for (const key of ["data", "result", "items", "members", "outlets"]) if (data[key] !== undefined) return records(data[key]);
        return Object.keys(data).some(key => /^(name|membername|outletname|phonenumber|userId|outletsId)$/i.test(key)) ? [data] : [];
    }
    document.addEventListener("DOMContentLoaded", () => document.querySelectorAll("[data-record-lookup]").forEach(form => form.addEventListener("submit", async event => {
        event.preventDefault();
        const button = form.querySelector("button"), status = form.querySelector("[data-lookup-status]"), results = form.querySelector("[data-lookup-results]");
        if (button.disabled) return;
        const method = form.elements.method.value, value = form.elements.value.value.trim(), route = routes[form.dataset.recordLookup]?.[method];
        if (!route || !value) return;
        button.disabled = true; status.textContent = "Finding records…"; results.textContent = "";
        try {
            const response = await window.adminFetch(`/Admin/${route}?${method}=${encodeURIComponent(value)}`, { cache: "no-store", headers: { Accept: "application/json" } });
            const text = await response.text(); let data; try { data = JSON.parse(text); } catch { throw new Error("The lookup did not return a readable record."); }
            if (!response.ok || data?.success === false) throw new Error(data.message || "The record could not be loaded.");
            const rows = records(data);
            status.textContent = rows.length ? `${rows.length} matching record${rows.length === 1 ? "" : "s"}` : "No matching records found.";
            results.innerHTML = rows.map(row => `<div class="border rounded p-2 mt-2"><strong>${escape(field(row, "Name", "MemberName", "OutletName"))}</strong><p class="mb-0">${escape(field(row, "PhoneNumber", "Phone", "Phone1"))} · ${escape(field(row, "Email", "Address"))}</p><small>Record: ${escape(field(row, "UserId", "OutletsId", "Id"))}</small></div>`).join("");
        } catch (error) { status.textContent = error.message || "Lookup failed. Try again."; }
        finally { button.disabled = false; }
    })));
})();
