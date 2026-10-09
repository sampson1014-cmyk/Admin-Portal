"use strict";


let merchantList = [];

let filteredMerchants = [];

let merchantModal = null;

let editingMerchant = false;


/*
=====================================================
STORE ORIGINAL MERCHANT VALUES
=====================================================
*/

let editingMerchantData = null;


/*
=====================================================
PAGE LOAD
=====================================================
*/

document.addEventListener(
    "DOMContentLoaded",
    function () {

        initializeMerchantModal();

        bindMerchantEvents();

        loadMerchants();

    }
);


/*
=====================================================
MODAL
=====================================================
*/

function initializeMerchantModal() {

    const modalElement =
        document.getElementById(
            "merchantModal"
        );


    if (
        modalElement &&
        typeof bootstrap !== "undefined"
    ) {

        merchantModal =
            bootstrap.Modal.getOrCreateInstance(
                modalElement
            );

    }

}


/*
=====================================================
EVENTS
=====================================================
*/

function bindMerchantEvents() {


    /*
    =================================================
    REFRESH
    =================================================
    */

    const refreshButton =
        document.getElementById(
            "refreshMerchants"
        );


    if (refreshButton) {

        refreshButton.addEventListener(
            "click",
            function () {

                loadMerchants();

            }
        );

    }


    /*
    =================================================
    SEARCH
    =================================================
    */

    const searchInput =
        document.getElementById(
            "merchantSearch"
        );


    if (searchInput) {

        searchInput.addEventListener(
            "input",
            function () {

                filterMerchants();

            }
        );

    }


    /*
    =================================================
    STATUS FILTER
    =================================================
    */

    const statusFilter =
        document.getElementById(
            "merchantStatusFilter"
        );


    if (statusFilter) {

        statusFilter.addEventListener(
            "change",
            function () {

                filterMerchants();

            }
        );

    }


    /*
    =================================================
    CLEAR
    =================================================
    */

    const clearButton =
        document.getElementById(
            "clearMerchantFilters"
        );


    if (clearButton) {

        clearButton.addEventListener(
            "click",
            function () {

                if (searchInput) {

                    searchInput.value = "";

                }


                if (statusFilter) {

                    statusFilter.value = "active";

                }


                filterMerchants();

            }
        );

    }


    /*
    =================================================
    ADD MERCHANT
    =================================================
    */

    const addButton =
        document.getElementById(
            "addMerchantButton"
        );


    if (addButton) {

        addButton.addEventListener(
            "click",
            function () {

                openAddMerchant();

            }
        );

    }


    /*
    =================================================
    FORM
    =================================================
    */

    const form =
        document.getElementById(
            "merchantForm"
        );


    if (form) {

        form.addEventListener(
            "submit",
            function (event) {

                event.preventDefault();

                saveMerchant();

            }
        );

    }


    /*
    =================================================
    EDIT / DELETE
    EVENT DELEGATION
    =================================================
    */

    const tbody =
        document.getElementById(
            "merchantTableBody"
        );


    if (tbody) {

        tbody.addEventListener(
            "click",
            function (event) {

                const button =
                    event.target.closest(
                        "button[data-action]"
                    );


                if (!button) {

                    return;

                }


                const action =
                    button.dataset.action;


                const id =
                    button.dataset.id;


                if (!id) {

                    return;

                }


                if (
                    action === "edit"
                ) {

                    editMerchant(id);

                }


                if (
                    action === "delete"
                ) {

                    deleteMerchant(id);

                }

            }
        );

    }

}


/*
=====================================================
LOAD MERCHANTS
=====================================================
*/

async function loadMerchants() {

    hideMessage();


    try {

        const response =
            await fetch(
                "/Admin/GetAllMerchants",
                {
                    method: "GET",

                    headers: {

                        "Accept":
                            "application/json"

                    }
                }
            );


        const text =
            await response.text();


        console.log(
            "GET ALL MERCHANTS STATUS:",
            response.status
        );


        console.log(
            "GET ALL MERCHANTS RESPONSE:",
            text
        );


        if (!response.ok) {

            let errorResult;

            try {

                errorResult =
                    JSON.parse(text);

            }
            catch {

                errorResult = null;

            }


            throw new Error(
                getApiErrorMessage(
                    errorResult,
                    "HTTP " +
                    response.status +
                    " - Unable to load merchants."
                )
            );

        }


        let data;


        try {

            data =
                JSON.parse(text);

        }
        catch {

            throw new Error(
                "Merchant API returned invalid JSON."
            );

        }


        console.log(
            "MERCHANT RESPONSE:",
            data
        );


        merchantList =
            normalizeMerchantData(
                data
            );


        filteredMerchants =
            [
                ...merchantList
            ];


        updateStatistics();

        renderMerchants();

    }
    catch (error) {

        console.error(
            "LOAD MERCHANT ERROR:",
            error
        );


        showError(
            error.message ||
            "Unable to load merchants."
        );


        showEmptyState(
            "Unable to load merchants.",
            "Please check the API connection."
        );

    }

}


/*
=====================================================
NORMALIZE MERCHANT DATA
=====================================================
*/

function normalizeMerchantData(
    data
) {

    if (
        Array.isArray(data)
    ) {

        return data;

    }


    if (
        data &&
        Array.isArray(
            data.data
        )
    ) {

        return data.data;

    }


    if (
        data &&
        Array.isArray(
            data.result
        )
    ) {

        return data.result;

    }


    if (
        data &&
        Array.isArray(
            data.items
        )
    ) {

        return data.items;

    }


    return [];

}


/*
=====================================================
GET VALUE
=====================================================
*/

function getValue(
    item,
    names,
    fallback = ""
) {

    if (!item) {

        return fallback;

    }


    for (
        const name of names
    ) {

        if (
            item[name] !== undefined &&
            item[name] !== null
        ) {

            return item[name];

        }

    }


    return fallback;

}


/*
=====================================================
DATABASE ID

This is the Id used by:

FindMerchantById?id=1
DeleteMerchant?Id=1
=====================================================
*/

function getMerchantId(
    item
) {

    return getValue(
        item,
        [
            "id",
            "Id"
        ],
        ""
    );

}


/*
=====================================================
MERCHANT CODE

This is MerchantId from API model.
=====================================================
*/

function getMerchantCode(
    item
) {

    return getValue(
        item,
        [
            "merchantId",
            "MerchantId"
        ],
        ""
    );

}


/*
=====================================================
MERCHANT NAME
=====================================================
*/

function getMerchantName(
    item
) {

    return getValue(
        item,
        [
            "merchantName",
            "MerchantName",
            "name",
            "Name"
        ],
        ""
    );

}


/*
=====================================================
PHONE 1
=====================================================
*/

function getMerchantPhone(
    item
) {

    return getValue(
        item,
        [
            "phone1",
            "Phone1",
            "phoneNumber",
            "PhoneNumber",
            "phone",
            "Phone"
        ],
        ""
    );

}


/*
=====================================================
PHONE 2
=====================================================
*/

function getMerchantPhone2(
    item
) {

    return getValue(
        item,
        [
            "phone2",
            "Phone2"
        ],
        ""
    );

}


/*
=====================================================
EMAIL

Your supplied API model does not contain Email,
so this is only for displaying older API data
if it exists.
=====================================================
*/

function getMerchantEmail(
    item
) {

    return getValue(
        item,
        [
            "email",
            "Email"
        ],
        ""
    );

}


/*
=====================================================
FAX
=====================================================
*/

function getMerchantFax(
    item
) {

    return getValue(
        item,
        [
            "fax",
            "Fax"
        ],
        ""
    );

}


/*
=====================================================
IMAGE
=====================================================
*/

function getMerchantImage(
    item
) {

    return getValue(
        item,
        [
            "image",
            "Image"
        ],
        ""
    );

}


/*
=====================================================
IMAGE BYTE
=====================================================
*/

function getMerchantImageByte(
    item
) {

    return getValue(
        item,
        [
            "imageByte",
            "ImageByte"
        ],
        ""
    );

}


/*
=====================================================
ADDRESS
=====================================================
*/

function getMerchantAddress(
    item
) {

    return getValue(
        item,
        [
            "address",
            "Address"
        ],
        ""
    );

}


/*
=====================================================
STATUS
=====================================================
*/

function getMerchantStatus(
    item
) {

    return getValue(
        item,
        [
            "status",
            "Status",
            "accountStatus",
            "AccountStatus",
            "merchantStatus",
            "MerchantStatus"
        ],
        "Inactive"
    );

}


/*
=====================================================
PASSWORD
=====================================================
*/

function getMerchantPassword(
    item
) {

    return getValue(
        item,
        [
            "password",
            "Password"
        ],
        ""
    );

}


/*
=====================================================
MANAGER PASSWORD
=====================================================
*/

function getManagerPassword(
    item
) {

    return getValue(
        item,
        [
            "managerPassword",
            "ManagerPassword"
        ],
        ""
    );

}


/*
=====================================================
ACTIVE STATUS
=====================================================
*/

function isActiveStatus(
    status
) {

    const value =
        String(status)
            .toLowerCase()
            .trim();


    return (

        value === "active" ||

        value === "activated" ||

        value === "enabled" ||

        value === "enable"

    );

}


/*
=====================================================
UPDATE STATISTICS
=====================================================
*/

function updateStatistics() {

    let active = 0;

    let inactive = 0;


    merchantList.forEach(
        function (merchant) {

            if (
                isActiveStatus(
                    getMerchantStatus(
                        merchant
                    )
                )
            ) {

                active++;

            }
            else {

                inactive++;

            }

        }
    );


    const totalElement =
        document.getElementById(
            "totalMerchants"
        );


    const activeElement =
        document.getElementById(
            "activeMerchants"
        );


    const inactiveElement =
        document.getElementById(
            "inactiveMerchants"
        );


    if (totalElement) {

        totalElement.textContent =
            merchantList.length;

    }


    if (activeElement) {

        activeElement.textContent =
            active;

    }


    if (inactiveElement) {

        inactiveElement.textContent =
            inactive;

    }

}


/*
=====================================================
FILTER
=====================================================
*/

function filterMerchants() {

    const searchInput =
        document.getElementById(
            "merchantSearch"
        );


    const statusFilter =
        document.getElementById(
            "merchantStatusFilter"
        );


    const search =
        searchInput
            ? searchInput.value
                .toLowerCase()
                .trim()
            : "";


    const selectedStatus =
        statusFilter
            ? statusFilter.value
            : "";


    filteredMerchants =
        merchantList.filter(
            function (merchant) {

                const name =
                    String(
                        getMerchantName(
                            merchant
                        )
                    )
                        .toLowerCase();


                const merchantCode =
                    String(
                        getMerchantCode(
                            merchant
                        )
                    )
                        .toLowerCase();


                const phone =
                    String(
                        getMerchantPhone(
                            merchant
                        )
                    )
                        .toLowerCase();


                const email =
                    String(
                        getMerchantEmail(
                            merchant
                        )
                    )
                        .toLowerCase();


                const matchesSearch =

                    search === "" ||

                    name.includes(
                        search
                    ) ||

                    merchantCode.includes(
                        search
                    ) ||

                    phone.includes(
                        search
                    ) ||

                    email.includes(
                        search
                    );


                const active =
                    isActiveStatus(
                        getMerchantStatus(
                            merchant
                        )
                    );


                let matchesStatus =
                    true;


                if (
                    selectedStatus ===
                    "active"
                ) {

                    matchesStatus =
                        active;

                }


                if (
                    selectedStatus ===
                    "inactive"
                ) {

                    matchesStatus =
                        !active;

                }


                return (

                    matchesSearch &&

                    matchesStatus

                );

            }
        );


    renderMerchants();

}


/*
=====================================================
RENDER
=====================================================
*/

function renderMerchants() {

    const state =
        document.getElementById(
            "merchantState"
        );


    const table =
        document.getElementById(
            "merchantTableWrapper"
        );


    const tbody =
        document.getElementById(
            "merchantTableBody"
        );


    const resultText =
        document.getElementById(
            "merchantResultText"
        );


    if (!tbody) {

        return;

    }


    tbody.innerHTML = "";


    /*
    =================================================
    NO DATA
    =================================================
    */

    if (
        filteredMerchants.length ===
        0
    ) {

        if (table) {

            table.hidden =
                true;

        }


        showEmptyState(
            "No merchants found.",
            "No merchants match your current filters."
        );


        if (resultText) {

            resultText.textContent =
                "0 merchants found.";

        }


        return;

    }


    /*
    =================================================
    SHOW TABLE
    =================================================
    */

    if (state) {

        state.hidden =
            true;

    }


    if (table) {

        table.hidden =
            false;

    }


    /*
    =================================================
    CREATE ROWS
    =================================================
    */

    filteredMerchants.forEach(
        function (merchant) {

            const id =
                String(
                    getMerchantId(
                        merchant
                    )
                );


            const merchantCode =
                getMerchantCode(
                    merchant
                );


            const name =
                getMerchantName(
                    merchant
                );


            const phone =
                getMerchantPhone(
                    merchant
                );


            const email =
                getMerchantEmail(
                    merchant
                );


            const status =
                getMerchantStatus(
                    merchant
                );


            const active =
                isActiveStatus(
                    status
                );


            const row =
                document.createElement(
                    "tr"
                );


            row.innerHTML = `

                <td>

                    <div class="merchant-id">

                        ${escapeHtml(id)}

                    </div>

                    <small>
                        ${escapeHtml(merchantCode)}
                    </small>

                </td>


                <td>

                    <div class="merchant-name">

                        ${escapeHtml(name)}

                    </div>

                </td>


                <td>

                    ${escapeHtml(phone)}

                </td>


                <td>

                    ${escapeHtml(email)}

                </td>


                <td>

                    <span class="
                        merchant-status
                        ${active ? "active" : "inactive"}
                    ">

                        ${escapeHtml(status)}

                    </span>

                </td>


                <td class="text-end">

                    <div class="merchant-action-group">

                        <button
                            type="button"
                            class="merchant-edit-btn"
                            data-action="edit"
                            data-id="${escapeHtml(id)}"
                            title="Edit Merchant">

                            <i class="bi bi-pencil"></i>

                        </button>


                        <button
                            type="button"
                            class="merchant-delete-btn"
                            data-action="delete"
                            data-id="${escapeHtml(id)}"
                            title="Delete Merchant">

                            <i class="bi bi-trash"></i>

                        </button>

                    </div>

                </td>

            `;


            tbody.appendChild(
                row
            );

        }
    );


    /*
    =================================================
    RESULT
    =================================================
    */

    if (resultText) {

        resultText.textContent =
            filteredMerchants.length +
            " merchant(s) found.";

    }

}


/*
=====================================================
OPEN ADD MERCHANT
=====================================================
*/

function openAddMerchant() {

    editingMerchant =
        false;


    editingMerchantData =
        null;


    clearMerchantForm();


    const title =
        document.getElementById(
            "merchantModalTitle"
        );


    const button =
        document.getElementById(
            "saveMerchantButton"
        );


    const passwordGroup =
        document.getElementById(
            "merchantPasswordGroup"
        );


    if (title) {

        title.textContent =
            "Add Merchant";

    }


    if (button) {

        button.textContent =
            "Create Merchant";

    }


    if (passwordGroup) {

        passwordGroup.style.display =
            "block";

    }


    const merchantId =
        document.getElementById(
            "merchantId"
        );


    if (merchantId) {

        merchantId.disabled =
            false;

    }


    hideFormError();


    if (merchantModal) {

        merchantModal.show();

    }

}


/*
=====================================================
EDIT MERCHANT
=====================================================
REAL API:

GET
/api/ManageMerchant/FindMerchantById?id=1
=====================================================
*/

async function editMerchant(id) {

    console.log(
        "EDIT MERCHANT ID:",
        id
    );


    try {

        const response =
            await fetch(
                "/Admin/GetMerchantById?id=" +
                encodeURIComponent(id),
                {
                    method: "GET",

                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );


        const text =
            await response.text();


        console.log(
            "EDIT HTTP STATUS:",
            response.status
        );


        console.log(
            "EDIT API RESPONSE:",
            text
        );


        let merchant;


        try {

            merchant =
                JSON.parse(text);

        }
        catch {

            const responsePreview =
                (text || "<empty response>")
                    .replace(/\s+/g, " ")
                    .slice(0, 240);

            throw new Error(
                "FindMerchantById returned non-JSON " +
                "(HTTP " + response.status +
                ", " + (response.headers.get("content-type") || "unknown content type") +
                (response.headers.get("allow") ? ", allowed methods: " + response.headers.get("allow") : "") +
                "): " + responsePreview
            );

        }


        if (!response.ok) {

            throw new Error(
                getApiErrorMessage(
                    merchant,
                    "Unable to get merchant. HTTP " +
                    response.status
                )
            );

        }


        /*
        ============================================
        REAL API RETURNS DIRECT OBJECT
        ============================================
        */

        // The API has returned both direct objects and wrapped results in
        // different environments. Normalize the common response shapes.
        while (merchant && !Array.isArray(merchant) && typeof merchant === "object") {
            const wrapped =
                merchant.data ??
                merchant.result ??
                merchant.item;

            if (wrapped === undefined || wrapped === merchant) {
                break;
            }

            merchant = wrapped;
        }

        if (Array.isArray(merchant)) {
            merchant = merchant[0];
        }


        console.log(
            "MERCHANT FOR EDIT:",
            merchant
        );


        /*
        ============================================
        CHECK ID
        ============================================
        */

        const merchantDatabaseId = getValue(merchant, ["id", "Id"]);

        if (merchantDatabaseId === "") {

            throw new Error(
                "Merchant ID was not returned by API."
            );

        }


        /*
        ============================================
        SAVE ORIGINAL DATA
        ============================================
        */

        editingMerchantData =
            merchant;

        editingMerchant =
            true;


        /*
        ============================================
        DATABASE ID
        ============================================
        */

        const originalId =
            document.getElementById(
                "merchantOriginalId"
            );


        if (originalId) {

            originalId.value =
                merchantDatabaseId;

        }


        /*
        ============================================
        MERCHANT ID
        ============================================
        */

        const merchantId =
            document.getElementById(
                "merchantId"
            );


        if (merchantId) {

            merchantId.value =
                getMerchantCode(merchant);

            merchantId.disabled =
                true;

        }


        /*
        ============================================
        MERCHANT NAME
        ============================================
        */

        const merchantName =
            document.getElementById(
                "merchantName"
            );


        if (merchantName) {

            merchantName.value =
                getMerchantName(merchant);

        }


        /*
        ============================================
        EMAIL
        ============================================
        */

        const merchantEmail =
            document.getElementById(
                "merchantEmail"
            );


        if (merchantEmail) {

            merchantEmail.value =
                getMerchantEmail(merchant);

        }


        /*
        ============================================
        PHONE
        ============================================
        */

        const merchantPhone =
            document.getElementById(
                "merchantPhone"
            );


        if (merchantPhone) {

            merchantPhone.value =
                getMerchantPhone(merchant);

        }


        /*
        ============================================
        ADDRESS
        ============================================
        */

        const merchantAddress =
            document.getElementById(
                "merchantAddress"
            );


        if (merchantAddress) {

            merchantAddress.value =
                getMerchantAddress(merchant);

        }


        /*
        ============================================
        STATUS
        ============================================
        */

        const merchantStatus =
            document.getElementById(
                "merchantStatus"
            );


        if (merchantStatus) {

            const statusValue = getMerchantStatus(merchant);
            merchantStatus.value =
                isActiveStatus(statusValue) ? "Active" : "Inactive";

        }


        /*
        ============================================
        PASSWORD
        ============================================
        */

        const merchantPassword =
            document.getElementById(
                "merchantPassword"
            );


        if (merchantPassword) {

            merchantPassword.value =
                "";

        }


        /*
        ============================================
        MODAL TITLE
        ============================================
        */

        const title =
            document.getElementById(
                "merchantModalTitle"
            );


        if (title) {

            title.textContent =
                "Edit Merchant";

        }


        /*
        ============================================
        BUTTON
        ============================================
        */

        const saveButton =
            document.getElementById(
                "saveMerchantButton"
            );


        if (saveButton) {

            saveButton.textContent =
                "Save Changes";

        }


        /*
        ============================================
        PASSWORD HIDDEN DURING EDIT
        ============================================
        */

        const passwordGroup =
            document.getElementById(
                "merchantPasswordGroup"
            );


        if (passwordGroup) {

            passwordGroup.style.display =
                "none";

        }


        hideFormError();


        /*
        ============================================
        OPEN MODAL
        ============================================
        */

        if (merchantModal) {

            merchantModal.show();

        }

    }
    catch (error) {

        console.error(
            "EDIT MERCHANT ERROR:",
            error
        );


        showError(
            error.message ||
            "Unable to get merchant."
        );

    }

}


/*
=====================================================
GET API ERROR MESSAGE
=====================================================
*/

function getApiErrorMessage(
    result,
    fallback
) {

    if (!result) {

        return fallback;

    }


    /*
    ================================================
    MESSAGE
    ================================================
    */

    if (
        result.message &&
        String(
            result.message
        ).trim() !== ""
    ) {

        return result.message;

    }


    /*
    ================================================
    TITLE
    ================================================
    */

    if (
        result.title &&
        String(
            result.title
        ).trim() !== ""
    ) {

        return result.title;

    }


    /*
    ================================================
    ERRORS
    ================================================
    */

    if (result.errors) {

        const messages =
            [];


        Object.keys(
            result.errors
        ).forEach(
            function (key) {

                const value =
                    result.errors[key];


                if (
                    Array.isArray(value)
                ) {

                    value.forEach(
                        function (message) {

                            messages.push(
                                key +
                                ": " +
                                message
                            );

                        }
                    );

                }
                else {

                    messages.push(
                        key +
                        ": " +
                        value
                    );

                }

            }
        );


        if (
            messages.length >
            0
        ) {

            return messages.join(
                "\n"
            );

        }

    }


    return fallback;

}


/*
=====================================================
CLEAR FORM
=====================================================
*/

function clearMerchantForm() {

    const originalId =
        document.getElementById(
            "merchantOriginalId"
        );


    const merchantId =
        document.getElementById(
            "merchantId"
        );


    const merchantName =
        document.getElementById(
            "merchantName"
        );


    const merchantEmail =
        document.getElementById(
            "merchantEmail"
        );


    const merchantPhone =
        document.getElementById(
            "merchantPhone"
        );


    const merchantAddress =
        document.getElementById(
            "merchantAddress"
        );


    const merchantPassword =
        document.getElementById(
            "merchantPassword"
        );


    const merchantStatus =
        document.getElementById(
            "merchantStatus"
        );


    if (originalId) {

        originalId.value =
            "";

    }


    if (merchantId) {

        merchantId.value =
            "";

        merchantId.disabled =
            false;

    }


    if (merchantName) {

        merchantName.value =
            "";

    }


    if (merchantEmail) {

        merchantEmail.value =
            "";

    }


    if (merchantPhone) {

        merchantPhone.value =
            "";

    }


    if (merchantAddress) {

        merchantAddress.value =
            "";

    }


    if (merchantPassword) {

        merchantPassword.value =
            "";

    }


    if (merchantStatus) {

        merchantStatus.value =
            "Active";

    }

}


/*
=====================================================
SAVE MERCHANT
=====================================================
*/

async function saveMerchant() {

    const merchantIdElement =
        document.getElementById(
            "merchantId"
        );


    const merchantNameElement =
        document.getElementById(
            "merchantName"
        );


    const merchantEmailElement =
        document.getElementById(
            "merchantEmail"
        );


    const merchantPhoneElement =
        document.getElementById(
            "merchantPhone"
        );


    const merchantAddressElement =
        document.getElementById(
            "merchantAddress"
        );


    const merchantPasswordElement =
        document.getElementById(
            "merchantPassword"
        );


    const merchantStatusElement =
        document.getElementById(
            "merchantStatus"
        );


    const originalIdElement =
        document.getElementById(
            "merchantOriginalId"
        );


    const merchantId =
        merchantIdElement
            ? merchantIdElement.value.trim()
            : "";


    const merchantName =
        merchantNameElement
            ? merchantNameElement.value.trim()
            : "";


    const email =
        merchantEmailElement
            ? merchantEmailElement.value.trim()
            : "";


    const phone =
        merchantPhoneElement
            ? merchantPhoneElement.value.trim()
            : "";


    const address =
        merchantAddressElement
            ? merchantAddressElement.value.trim()
            : "";


    const enteredPassword =
        merchantPasswordElement
            ? merchantPasswordElement.value
            : "";


    const status =
        merchantStatusElement
            ? merchantStatusElement.value
            : "";


    const originalId =
        originalIdElement
            ? originalIdElement.value
            : "0";


    /*
    =================================================
    VALIDATION
    =================================================
    */

    if (
        merchantId === ""
    ) {

        showFormError(
            "Merchant ID is required."
        );

        return;

    }


    if (
        merchantName === ""
    ) {

        showFormError(
            "Merchant name is required."
        );

        return;

    }


    if (
        phone === ""
    ) {

        showFormError(
            "Phone 1 is required."
        );

        return;

    }


    if (
        address === ""
    ) {

        showFormError(
            "Address is required."
        );

        return;

    }


    if (
        status === ""
    ) {

        showFormError(
            "Status is required."
        );

        return;

    }


    if (
        !editingMerchant &&
        enteredPassword === ""
    ) {

        showFormError(
            "Password is required when creating a merchant."
        );

        return;

    }


    /*
    =================================================
    BUTTON
    =================================================
    */

    const button =
        document.getElementById(
            "saveMerchantButton"
        );


    if (button) {

        button.disabled =
            true;

        button.textContent =
            "Saving...";

    }


    try {

        /*
        =================================================
        ORIGINAL DATA
        =================================================
        */

        const original =
            editingMerchantData ||
            {};


        /*
        =================================================
        PASSWORD

        CREATE:
        Use entered password.

        EDIT:
        Use new password if entered,
        otherwise keep old password.
        =================================================
        */

        let password =
            enteredPassword;


        if (
            editingMerchant &&
            password === ""
        ) {

            password =
                getMerchantPassword(
                    original
                );

        }


        /*
        =================================================
        CREATE / EDIT PAYLOAD

        Matches supplied API model.
        =================================================
        */

        const payload = {

            Id:
                editingMerchant
                    ? Number(
                        originalId || 0
                    )
                    : 0,

            MerchantId:
                merchantId,

            MerchantName:
                merchantName,

            Password:
                password,

            Phone1:
                phone,

            Phone2:
                getMerchantPhone2(
                    original
                ),

            Fax:
                getMerchantFax(
                    original
                ),

            Image:
                getMerchantImage(
                    original
                ),

            ImageByte:
                getMerchantImageByte(
                    original
                ),

            Address:
                address,

            Status:
                status,

            ManagerPassword:
                getManagerPassword(
                    original
                )

        };


        /*
        =================================================
        LOG
        =================================================
        */

        console.log(
            "MERCHANT PAYLOAD:",
            payload
        );


        /*
        =================================================
        URL
        =================================================
        */

        const url =
            editingMerchant
                ? "/Admin/EditMerchant"
                : "/Admin/CreateMerchant";


        /*
        =================================================
        REQUEST
        =================================================
        */

        const response =
            await fetch(
                url,
                {

                    method:
                        "POST",

                    headers:
                    {

                        "Content-Type":
                            "application/json",

                        "Accept":
                            "application/json"

                    },

                    body:
                        JSON.stringify(
                            payload
                        )

                }
            );


        /*
        =================================================
        READ RESPONSE
        =================================================
        */

        const text =
            await response.text();


        console.log(
            "SAVE STATUS:",
            response.status
        );


        console.log(
            "SAVE RESPONSE:",
            text
        );


        let result =
            null;


        if (
            text &&
            text.trim() !== ""
        ) {

            try {

                result =
                    JSON.parse(
                        text
                    );

            }
            catch {

                result = {

                    success:
                        response.ok,

                    message:
                        text

                };

            }

        }
        else {

            result = {

                success:
                    response.ok,

                message:
                    ""

            };

        }


        /*
        =================================================
        ERROR
        =================================================
        */

        if (
            !response.ok
        ) {

            throw new Error(
                getApiErrorMessage(
                    result,
                    "Unable to save merchant."
                )
            );

        }


        /*
        =================================================
        API RETURNED success:false
        =================================================
        */

        if (
            result &&
            result.success === false
        ) {

            throw new Error(
                getApiErrorMessage(
                    result,
                    "Unable to save merchant."
                )
            );

        }


        /*
        =================================================
        SUCCESS
        =================================================
        */

        if (merchantModal) {

            merchantModal.hide();

        }


        showMessage(
            editingMerchant
                ? "Merchant updated successfully."
                : "Merchant created successfully.",
            "success"
        );


        /*
        CLEAR EDIT DATA
        */

        editingMerchantData =
            null;


        editingMerchant =
            false;


        /*
        RELOAD LIST
        */

        await loadMerchants();

    }
    catch (error) {

        console.error(
            "SAVE MERCHANT ERROR:",
            error
        );


        showFormError(
            error.message ||
            "Unable to save merchant."
        );

    }
    finally {

        if (button) {

            button.disabled =
                false;


            button.textContent =
                editingMerchant
                    ? "Save Changes"
                    : "Create Merchant";

        }

    }

}


/*
=====================================================
DELETE MERCHANT

MVC:
POST /Admin/DeleteMerchant?id=1

Controller then calls:

DELETE
/api/ManageMerchant/DeleteMerchant?Id=1
=====================================================
*/

async function deleteMerchant(
    id
) {

    console.log(
        "DELETE MERCHANT ID:",
        id
    );


    if (
        !window.confirm(
            "Are you sure you want to delete this merchant?"
        )
    ) {

        return;

    }


    try {

        const response =
            await fetch(
                "/Admin/DeleteMerchant?id=" +
                encodeURIComponent(id),
                {

                    method:
                        "POST",

                    headers:
                    {

                        "Accept":
                            "application/json"

                    }

                }
            );


        const text =
            await response.text();


        console.log(
            "DELETE STATUS:",
            response.status
        );


        console.log(
            "DELETE RESPONSE:",
            text
        );


        let result =
            null;


        /*
        ================================================
        DELETE MAY RETURN EMPTY RESPONSE
        ================================================
        */

        if (
            text &&
            text.trim() !== ""
        ) {

            try {

                result =
                    JSON.parse(
                        text
                    );

            }
            catch {

                result = {

                    success:
                        response.ok,

                    message:
                        text

                };

            }

        }
        else {

            result = {

                success:
                    response.ok,

                message:
                    ""

            };

        }


        /*
        ================================================
        HTTP ERROR
        ================================================
        */

        if (
            !response.ok
        ) {

            throw new Error(
                getApiErrorMessage(
                    result,
                    "Unable to delete merchant. HTTP " +
                    response.status
                )
            );

        }


        /*
        ================================================
        SUCCESS FALSE
        ================================================
        */

        if (
            result &&
            result.success === false
        ) {

            throw new Error(
                getApiErrorMessage(
                    result,
                    "Unable to delete merchant."
                )
            );

        }


        /*
        ================================================
        SUCCESS
        ================================================
        */

        showMessage(
            "Merchant deleted successfully.",
            "success"
        );


        await loadMerchants();

    }
    catch (error) {

        console.error(
            "DELETE MERCHANT ERROR:",
            error
        );


        showError(
            error.message ||
            "Unable to delete merchant."
        );

    }

}


/*
=====================================================
EMPTY STATE
=====================================================
*/

function showEmptyState(
    title,
    message
) {

    const state =
        document.getElementById(
            "merchantState"
        );


    const titleElement =
        document.getElementById(
            "merchantStateTitle"
        );


    const textElement =
        document.getElementById(
            "merchantStateText"
        );


    if (titleElement) {

        titleElement.textContent =
            title;

    }


    if (textElement) {

        textElement.textContent =
            message;

    }


    if (state) {

        state.hidden =
            false;

    }

}


/*
=====================================================
MESSAGE
=====================================================
*/

function showMessage(
    message,
    type
) {

    const element =
        document.getElementById(
            "merchantMessage"
        );


    if (!element) {

        return;

    }


    element.textContent =
        message;


    element.className =
        "merchant-message " +
        type;


    element.hidden =
        false;


    setTimeout(
        function () {

            element.hidden =
                true;

        },
        3000
    );

}


function showError(
    message
) {

    showMessage(
        message,
        "error"
    );

}


function hideMessage() {

    const element =
        document.getElementById(
            "merchantMessage"
        );


    if (!element) {

        return;

    }


    element.hidden =
        true;


    element.textContent =
        "";

}


/*
=====================================================
FORM ERROR
=====================================================
*/

function showFormError(
    message
) {

    const element =
        document.getElementById(
            "merchantFormError"
        );


    if (!element) {

        return;

    }


    element.textContent =
        message;


    element.hidden =
        false;

}


function hideFormError() {

    const element =
        document.getElementById(
            "merchantFormError"
        );


    if (!element) {

        return;

    }


    element.textContent =
        "";


    element.hidden =
        true;

}


/*
=====================================================
ESCAPE HTML
=====================================================
*/

function escapeHtml(
    value
) {

    return String(
        value ?? ""
    )

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );

}
