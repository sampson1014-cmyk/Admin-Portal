"use strict";

let menuItems = [], filteredMenuItems = [], editingMenuItem = null;
const pick = (item, names, fallback = "") => names.map(name => item?.[name]).find(value => value !== undefined && value !== null) ?? fallback;
const dbId = item => pick(item, ["id", "Id"]);
const menuId = item => pick(item, ["menuId", "MenuId"]);
const itemName = item => pick(item, ["itemName", "ItemName", "name", "Name"]);
const description = item => pick(item, ["itemDescription", "ItemDescription", "description", "Description"]);
const price = item => Number(pick(item, ["price", "Price"], 0));
const qty = item => Number(pick(item, ["qty", "Qty"], 0));
const category = item => pick(item, ["category", "Category"], "General");
const status = item => pick(item, ["status", "Status"], "Inactive");
const image = item => pick(item, ["image", "Image"]);
const imageByte = item => pick(item, ["imageByte", "ImageByte"]);
const delivery = item => boolValue(pick(item, ["isDeliveryAllow", "IsDeliveryAllow"], false));
const spicy = item => boolValue(pick(item, ["isSpicy", "IsSpicy"], false));
const isActive = item => ["active", "enabled", "1", "true"].includes(String(status(item)).toLowerCase());
const html = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("refreshMenu").addEventListener("click", loadMenu);
    document.getElementById("addMenuButton").addEventListener("click", openCreateMenu);
    document.getElementById("closeMenuModal").addEventListener("click", closeMenuModal);
    document.getElementById("cancelMenuModal").addEventListener("click", closeMenuModal);
    document.getElementById("menuModal").addEventListener("click", event => { if (event.target.id === "menuModal") closeMenuModal(); });
    document.getElementById("menuForm").addEventListener("submit", saveMenuItem);
    document.getElementById("menuSearch").addEventListener("input", filterMenu);
    document.getElementById("menuCategoryFilter").addEventListener("change", filterMenu);
    document.getElementById("menuStatusFilter").addEventListener("change", filterMenu);
    document.getElementById("clearMenuFilters").addEventListener("click", clearFilters);
    document.getElementById("menuGrid").addEventListener("click", handleMenuAction);
    loadMenu();
});

async function loadMenu() {
    showLoading(true);
    try {
        const response = await window.adminFetch("/Admin/Menu", { headers: { "X-Requested-With": "XMLHttpRequest", "Accept": "application/json" }, cache: "no-store" });
        const data = await readJson(response);
        if (!response.ok) throw new Error(apiMessage(data, "Unable to load menu items."));
        menuItems = extractArray(data); buildCategories(); filterMenu();
    } catch (error) { menuItems = []; filteredMenuItems = []; renderMenu(); setMenuState("Unable to load menu", error.message || "Check API authorization."); notify(error.message || "Unable to load menu.", "error"); }
    finally { showLoading(false); }
}

function extractArray(data) { if (Array.isArray(data)) return data; for (const key of ["data", "result", "items", "list", "records", "rows", "Data", "Result", "Items"]) { if (Array.isArray(data?.[key])) return data[key]; if (data?.[key] && typeof data[key] === "object") { const nested = extractArray(data[key]); if (nested.length) return nested; } } return []; }
function boolValue(value) { return value === true || value === 1 || String(value).toLowerCase() === "true" || String(value) === "1"; }

function buildCategories() {
    const select = document.getElementById("menuCategoryFilter"), selected = select.value;
    const categories = [...new Set(menuItems.map(category).filter(Boolean))].sort();
    select.innerHTML = `<option value="">All Categories</option>${categories.map(value => `<option value="${html(value)}">${html(value)}</option>`).join("")}`;
    if (categories.includes(selected)) select.value = selected;
}

function clearFilters() { document.getElementById("menuSearch").value = ""; document.getElementById("menuCategoryFilter").value = ""; document.getElementById("menuStatusFilter").value = ""; filterMenu(); }
function filterMenu() {
    const search = document.getElementById("menuSearch").value.trim().toLowerCase(), selectedCategory = document.getElementById("menuCategoryFilter").value.toLowerCase(), selectedStatus = document.getElementById("menuStatusFilter").value;
    filteredMenuItems = menuItems.filter(item => { const matchesSearch = !search || [itemName(item), description(item), category(item), menuId(item)].join(" ").toLowerCase().includes(search); const matchesCategory = !selectedCategory || String(category(item)).toLowerCase() === selectedCategory; const matchesStatus = !selectedStatus || (selectedStatus === "active" ? isActive(item) : !isActive(item)); return matchesSearch && matchesCategory && matchesStatus; });
    document.getElementById("totalMenuItems").textContent = menuItems.length;
    document.getElementById("activeMenuItems").textContent = menuItems.filter(isActive).length;
    document.getElementById("menuCategoryCount").textContent = new Set(menuItems.map(category).filter(Boolean)).size;
    document.getElementById("deliveryMenuItems").textContent = menuItems.filter(delivery).length;
    renderMenu();
}

function renderMenu() {
    const grid = document.getElementById("menuGrid");
    document.getElementById("menuResultText").textContent = `${filteredMenuItems.length} item(s) found.`;
    if (!filteredMenuItems.length) { grid.innerHTML = ""; grid.hidden = true; setMenuState("No Menu Items", "No products match the current filters."); return; }
    document.getElementById("menuState").hidden = true; grid.hidden = false;
    grid.innerHTML = filteredMenuItems.map(item => { const source = image(item) || (imageByte(item) ? `data:image/jpeg;base64,${imageByte(item)}` : ""); return `<article class="menu-card"><div class="menu-card-image">${source ? `<img src="${html(source)}" alt="${html(itemName(item))}" onerror="this.replaceWith(document.createTextNode('No Image'))">` : "No Image"}</div><div class="menu-card-body"><div class="menu-card-top"><span class="menu-card-category">${html(category(item))}</span><span class="menu-card-status ${isActive(item) ? "" : "inactive"}">${html(status(item))}</span></div><h4>${html(itemName(item) || "Unnamed Item")}</h4><div class="menu-card-description">${html(description(item) || "No description")}</div><div class="menu-card-info"><span>RM ${price(item).toFixed(2)}</span><span>Qty: ${qty(item)}</span></div><div class="menu-card-actions"><button type="button" class="edit" data-action="edit" data-key="${html(recordKey(item))}"><i class="bi bi-pencil-square"></i> Edit</button><button type="button" class="delete" data-action="delete" data-key="${html(recordKey(item))}"><i class="bi bi-trash3"></i> Delete</button></div></div></article>`; }).join("");
}

function recordKey(item) { return String(dbId(item) || menuId(item)); }
function handleMenuAction(event) { const button = event.target.closest("button[data-action]"); if (!button) return; const item = menuItems.find(row => recordKey(row) === button.dataset.key); if (!item) return; button.dataset.action === "edit" ? openEditMenu(item) : deleteMenuItem(item); }
function setMenuState(title, text) { document.getElementById("menuStateTitle").textContent = title; document.getElementById("menuStateText").textContent = text; document.getElementById("menuState").hidden = false; }
function showLoading(show) { document.getElementById("menuLoading").hidden = !show; if (show) { document.getElementById("menuGrid").hidden = true; document.getElementById("menuState").hidden = true; } }

function openCreateMenu() { editingMenuItem = null; document.getElementById("menuForm").reset(); document.getElementById("menuId").value = ""; document.getElementById("menuQty").value = "0"; document.getElementById("menuSubItems").value = "[]"; document.getElementById("menuModalTitle").textContent = "Add Menu Item"; document.getElementById("saveMenuButton").textContent = "Create Item"; formError(""); openMenuModal(); }
function openEditMenu(item) { editingMenuItem = item; document.getElementById("menuId").value = menuId(item); document.getElementById("menuItemName").value = itemName(item); document.getElementById("menuDescription").value = description(item); document.getElementById("menuPrice").value = price(item); document.getElementById("menuQty").value = qty(item); document.getElementById("menuCategory").value = category(item); document.getElementById("menuStatus").value = isActive(item) ? "Active" : "Inactive"; document.getElementById("menuImage").value = image(item); document.getElementById("menuDelivery").checked = delivery(item); document.getElementById("menuSpicy").checked = spicy(item); const subItems = pick(item, ["subMenuListJson", "SubMenuListJson", "subMenuList", "SubMenuList"], "[]"); document.getElementById("menuSubItems").value = typeof subItems === "string" ? subItems : JSON.stringify(subItems); document.getElementById("menuModalTitle").textContent = "Edit Menu Item"; document.getElementById("saveMenuButton").textContent = "Save Changes"; formError(""); openMenuModal(); }
function openMenuModal() { document.getElementById("menuModal").hidden = false; document.body.classList.add("menu-dialog-open"); }
function closeMenuModal() { document.getElementById("menuModal").hidden = true; document.body.classList.remove("menu-dialog-open"); }

async function saveMenuItem(event) {
    event.preventDefault(); const name = document.getElementById("menuItemName").value.trim(), categoryValue = document.getElementById("menuCategory").value.trim();
    if (!name || !categoryValue) { formError("Item name and category are required."); return; }
    const subMenuJson = document.getElementById("menuSubItems").value.trim() || "[]";
    try { JSON.parse(subMenuJson); } catch { formError("Sub Menu / Add-ons must be valid JSON."); return; }
    const original = editingMenuItem || {};
    const payload = { MenuId: editingMenuItem ? menuId(original) : "", Image: document.getElementById("menuImage").value.trim(), ImageByte: editingMenuItem ? imageByte(original) : "", ItemName: name, ItemDescription: document.getElementById("menuDescription").value.trim(), Price: Number(document.getElementById("menuPrice").value || 0), Qty: Number(document.getElementById("menuQty").value || 0), IsDeliveryAllow: document.getElementById("menuDelivery").checked, IsSpicy: document.getElementById("menuSpicy").checked, Status: document.getElementById("menuStatus").value, Category: categoryValue, SubMenuListJson: subMenuJson };
    const button = document.getElementById("saveMenuButton"); button.disabled = true; button.textContent = "Saving...";
    try { const response = await window.adminFetch(editingMenuItem ? "/Admin/EditMenu" : "/Admin/CreateMenuItem", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(payload) }); const data = await readJson(response); if (!response.ok || data?.success === false) throw new Error(apiMessage(data, "Unable to save menu item.")); closeMenuModal(); notify(editingMenuItem ? "Menu item updated successfully." : "Menu item created successfully.", "success"); await loadMenu(); } catch (error) { formError(error.message || "Unable to save menu item."); } finally { button.disabled = false; button.textContent = editingMenuItem ? "Save Changes" : "Create Item"; }
}

async function deleteMenuItem(item) {
    if (!confirm(`Delete ${itemName(item) || "this menu item"}?`)) return;
    try { const hasMenuId = Boolean(menuId(item)); const response = await window.adminFetch(hasMenuId ? "/Admin/DeleteMenu" : `/Admin/DeleteMenuById?id=${encodeURIComponent(dbId(item))}`, { method: "POST", headers: hasMenuId ? { "Content-Type": "application/json", "Accept": "application/json" } : { "Accept": "application/json" }, body: hasMenuId ? JSON.stringify({ MenuId: menuId(item) }) : undefined }); const data = await readJson(response); if (!response.ok || data?.success === false) throw new Error(apiMessage(data, "Unable to delete menu item.")); notify("Menu item deleted successfully.", "success"); await loadMenu(); } catch (error) { notify(error.message || "Unable to delete menu item.", "error"); }
}

async function readJson(response) { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return { message: text || `HTTP ${response.status}` }; } }
function apiMessage(data, fallback) { if (data?.errors) return Object.values(data.errors).flat().join(" "); return data?.message || data?.title || fallback; }
function notify(text, type) { const box = document.getElementById("menuMessage"); box.textContent = text; box.className = `menu-message ${type}`; box.hidden = false; setTimeout(() => box.hidden = true, 4500); }
function formError(text) { const box = document.getElementById("menuFormError"); box.textContent = text; box.hidden = !text; }
