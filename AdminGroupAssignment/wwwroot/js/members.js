"use strict";


let membersState = [];

let filteredMembers = [];

let currentPage = 1;

const pageSize = 10;


/* =========================================================
   INITIALIZE
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        bindMemberEvents();

        loadMembers();

    }
);


/* =========================================================
   EVENTS
========================================================= */

function bindMemberEvents() {

    const refresh =
        document.getElementById(
            "refreshMembers"
        );


    if (refresh) {

        refresh.addEventListener(
            "click",
            function () {

                loadMembers();

            }
        );

    }


    const addButton =
        document.getElementById(
            "btnAddMember"
        );


    if (addButton) {

        addButton.addEventListener(
            "click",
            function () {

                openAddMemberModal();

            }
        );

    }


    const search =
        document.getElementById(
            "memberSearch"
        );


    if (search) {

        search.addEventListener(
            "input",
            function () {

                currentPage = 1;

                applyMemberFilters();

            }
        );

    }


    const tier =
        document.getElementById(
            "tierFilter"
        );


    if (tier) {

        tier.addEventListener(
            "change",
            function () {

                currentPage = 1;

                applyMemberFilters();

            }
        );

    }


    const status =
        document.getElementById(
            "statusFilter"
        );


    const startDateFilter =
        document.getElementById(
            "startDateFilter"
        );


    const endDateFilter =
        document.getElementById(
            "endDateFilter"
        );


    if (status) {

        status.addEventListener(
            "change",
            function () {

                currentPage = 1;

                applyMemberFilters();

            }
        );

    }


    [startDateFilter, endDateFilter]
        .filter(Boolean)
        .forEach(
            function (input) {

                input.addEventListener(
                    "change",
                    function () {

                        syncMemberDateRange(input.id);

                        currentPage = 1;

                        applyMemberFilters();

                    }
                );

            }
        );


    /* =====================================================
       FORM SUBMIT

       ONLY ONE SAVE EVENT
    ===================================================== */

    const form =
        document.getElementById(
            "memberForm"
        );


    if (form) {

        form.addEventListener(
            "submit",
            function (event) {

                event.preventDefault();

                saveMember();

            }
        );

    }


    /* =====================================================
       CLOSE
    ===================================================== */

    document
        .querySelectorAll("[data-close]")
        .forEach(
            function (element) {

                element.addEventListener(
                    "click",
                    function () {

                        closeMemberModal();

                    }
                );

            }
        );

}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

    showMembersLoading();


    try {

        const controller =
            new AbortController();


        const timer =
            setTimeout(
                function () {

                    controller.abort();

                },
                15000
            );


        const response =
            await fetch(
                "/Admin/Members",
                {
                    method:
                        "GET",

                    headers:
                    {
                        "X-Requested-With":
                            "XMLHttpRequest",

                        "Accept":
                            "application/json"
                    },

                    cache:
                        "no-store",

                    signal:
                        controller.signal
                }
            );


        clearTimeout(timer);


        if (
            response.status ===
            401
        ) {

            window.location.href =
                "/Admin/LoginPage";

            return;

        }


        if (!response.ok) {

            throw new Error(
                await response.text()
            );

        }


        const result =
            await response.json();


        let list = [];


        if (
            Array.isArray(result)
        ) {

            list =
                result;

        }
        else if (
            Array.isArray(
                result.members
            )
        ) {

            list =
                result.members;

        }
        else if (
            Array.isArray(
                result.data
            )
        ) {

            list =
                result.data;

        }


        /*
         * IMPORTANT
         *
         * Keep ALL members.
         * Do NOT remove Deactive.
         */

        membersState =
            list;


        console.log(
            "[MEMBERS] Total records:",
            membersState.length
        );


        updateMemberSummary(
            membersState
        );


        currentPage = 1;


        applyMemberFilters();

    }
    catch (error) {

        console.error(
            "[MEMBERS LOAD ERROR]",
            error
        );


        showMembersError(
            error.message ||
            "Failed to load members."
        );

    }
    finally {

        hideMembersLoading();

    }

}


/* =========================================================
   SUMMARY
========================================================= */

function updateMemberSummary(
    list
) {

    let total = 0;

    let active = 0;

    let inactive = 0;

    let newMembers = 0;


    const today =
        new Date();


    const thirtyDaysAgo =
        new Date();


    thirtyDaysAgo.setDate(
        today.getDate() - 30
    );


    list.forEach(
        function (member) {

            const status =
                String(
                    member.AccountStatus ||
                    ""
                )
                    .trim()
                    .toLowerCase();


            const isActive =
                status === "active";


            const isInactive =
                status === "deactive" ||
                status === "inactive";


            /*
             * TOTAL
             *
             * EVERYTHING
             */

            total++;


            if (isActive) {

                active++;

            }


            if (isInactive) {

                inactive++;

            }


            if (
                !isInactive &&
                member.RegisterTime
            ) {

                const date =
                    new Date(
                        member.RegisterTime
                    );


                if (
                    !isNaN(
                        date.getTime()
                    ) &&
                    date >= thirtyDaysAgo
                ) {

                    newMembers++;

                }

            }

        }
    );


    setText(
        "totalMembers",
        total
    );


    setText(
        "activeMembers",
        active
    );


    setText(
        "inactiveMembers",
        inactive
    );


    setText(
        "newMembers",
        newMembers
    );

}


/* =========================================================
   FILTER
========================================================= */

function applyMemberFilters() {

    const search =
        getValue(
            "memberSearch"
        )
            .trim()
            .toLowerCase();


    const tier =
        getValue(
            "tierFilter"
        )
            .trim()
            .toLowerCase();


    const status =
        getValue(
            "statusFilter"
        )
            .trim()
            .toLowerCase();


    const startDateValue =
        getValue(
            "startDateFilter"
        )
            .trim();


    const endDateValue =
        getValue(
            "endDateFilter"
        )
            .trim();


    const startDate =
        startDateValue
            ? new Date(startDateValue + "T00:00:00")
            : null;


    const endDate =
        endDateValue
            ? new Date(endDateValue + "T23:59:59.999")
            : null;


    filteredMembers =
        membersState.filter(
            function (member) {

                const name =
                    String(
                        member.Name ||
                        ""
                    )
                        .toLowerCase();


                const email =
                    String(
                        member.Email ||
                        ""
                    )
                        .toLowerCase();


                const phone =
                    String(
                        member.PhoneNumber ||
                        ""
                    )
                        .toLowerCase();


                /* SEARCH */

                if (
                    search &&
                    !name.includes(search) &&
                    !email.includes(search) &&
                    !phone.includes(search)
                ) {

                    return false;

                }


                /* TIER */

                const memberTier =
                    String(
                        member.Tier ||
                        ""
                    )
                        .trim()
                        .toLowerCase();


                if (
                    tier &&
                    memberTier !== tier
                ) {

                    return false;

                }


                /* STATUS */

                const accountStatus =
                    String(
                        member.AccountStatus ||
                        ""
                    )
                        .trim()
                        .toLowerCase();


                const isActive =
                    accountStatus ===
                    "active";


                const isInactive =
                    accountStatus ===
                    "deactive" ||
                    accountStatus ===
                    "inactive";


                /* REGISTRATION DATE */

                if (startDate || endDate) {

                    const registeredValue =
                        member.RegisterTime ||
                        member.CreateDate ||
                        member.CreatedDate ||
                        "";

                    const registeredDate =
                        new Date(registeredValue);

                    if (isNaN(registeredDate.getTime())) {
                        return false;
                    }

                    if (startDate && registeredDate < startDate) {
                        return false;
                    }

                    if (endDate && registeredDate > endDate) {
                        return false;
                    }

                }


                /*
                 * ALL
                 *
                 * DO NOT HIDE ANYTHING
                 */

                if (!status) {

                    return true;

                }


                if (
                    status ===
                    "active"
                ) {

                    return isActive;

                }


                if (
                    status ===
                    "inactive" ||
                    status ===
                    "deactive"
                ) {

                    return isInactive;

                }


                return true;

            }
        );


    updateResultText();

    renderMembers();

}


function syncMemberDateRange(changedId) {

    const start = document.getElementById("startDateFilter");
    const end = document.getElementById("endDateFilter");

    if (!start || !end) {
        return;
    }

    end.min = start.value || "";
    start.max = end.value || "";

    if (start.value && end.value && start.value > end.value) {
        if (changedId === "startDateFilter") {
            end.value = start.value;
        }
        else {
            start.value = end.value;
        }
    }

}


/* =========================================================
   RENDER TABLE
========================================================= */

function renderMembers() {

    const body =
        document.getElementById(
            "membersTableBody"
        );


    if (!body) {
        return;
    }


    body.innerHTML = "";


    const total =
        filteredMembers.length;


    const pages =
        Math.max(
            1,
            Math.ceil(
                total /
                pageSize
            )
        );


    if (
        currentPage >
        pages
    ) {

        currentPage =
            pages;

    }


    const start =
        (
            currentPage -
            1
        ) *
        pageSize;


    const pageData =
        filteredMembers.slice(
            start,
            start +
            pageSize
        );


    if (
        pageData.length === 0
    ) {

        body.innerHTML = `
            <tr>
                <td
                    colspan="8"
                    style="
                        text-align:center;
                        padding:40px;
                    ">
                    No members found.
                </td>
            </tr>
        `;


        updatePagination();

        return;

    }


    pageData.forEach(
        function (member) {

            const id =
                Number(
                    member.Id ||
                    0
                );


            const name =
                escapeHtml(
                    member.Name ||
                    "-"
                );


            const email =
                escapeHtml(
                    member.Email ||
                    "-"
                );


            const phone =
                escapeHtml(
                    member.PhoneNumber ||
                    "-"
                );


            const tier =
                escapeHtml(
                    member.Tier ||
                    "-"
                );


            const registered =
                formatDate(
                    member.RegisterTime
                );


            const accountStatus =
                String(
                    member.AccountStatus ||
                    ""
                )
                    .trim()
                    .toLowerCase();


            const active =
                accountStatus ===
                "active";


            const statusText =
                active
                    ? "Active"
                    : "Inactive";


            const statusClass =
                active
                    ? "bg-success"
                    : "bg-secondary";


            const deactivateAction =
                active
                    ? `<button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteMember(${id})"><i class="bi bi-person-dash"></i> Deactivate</button>`
                    : `<span class="member-inactive-note"><i class="bi bi-eye-slash"></i> Inactive</span>`;


            const row =
                document.createElement(
                    "tr"
                );


            row.innerHTML = `

                <td>
                    ${id}
                </td>

                <td>
                    ${name}
                </td>

                <td>
                    ${email}
                </td>

                <td>
                    ${phone}
                </td>

                <td>
                    <span class="badge bg-light">
                        ${tier}
                    </span>
                </td>

                <td>
                    <span class="badge ${statusClass}">
                        ${statusText}
                    </span>
                </td>

                <td>
                    ${registered}
                </td>

                <td>

                    <button
                        type="button"
                        class="btn btn-sm btn-outline-dark"
                        onclick="editMember(${id})">

                        Edit

                    </button>

                    ${deactivateAction}

                </td>

            `;


            body.appendChild(
                row
            );

        }
    );


    updatePagination();

}


/* =========================================================
   RESULT
========================================================= */

function updateResultText() {

    const element =
        document.getElementById(
            "memberResultText"
        );


    if (!element) {
        return;
    }


    const total =
        filteredMembers.length;


    if (
        total === 0
    ) {

        element.textContent =
            "No members found.";

        return;

    }


    const start =
        (
            currentPage -
            1
        ) *
        pageSize +
        1;


    const end =
        Math.min(
            start +
            pageSize -
            1,
            total
        );


    element.textContent =
        `Showing ${start}-${end} of ${total}`;

}


/* =========================================================
   PAGINATION
========================================================= */

function updatePagination() {

    const container =
        document.getElementById(
            "membersPagination"
        );


    const info =
        document.getElementById(
            "paginationInfo"
        );


    if (!container) {
        return;
    }


    container.innerHTML = "";


    const total =
        filteredMembers.length;


    const pages =
        Math.max(
            1,
            Math.ceil(
                total /
                pageSize
            )
        );


    if (info) {

        if (!total) {

            info.textContent =
                "0 members";

        }
        else {

            const start =
                (
                    currentPage -
                    1
                ) *
                pageSize +
                1;


            const end =
                Math.min(
                    currentPage *
                    pageSize,
                    total
                );


            info.textContent =
                `${start}-${end} of ${total}`;

        }

    }


    if (
        pages <= 1
    ) {

        return;

    }


    addPageButton(
        container,
        "Previous",
        currentPage === 1,
        function () {

            currentPage--;

            renderMembers();

        }
    );


    for (
        let page = 1;
        page <= pages;
        page++
    ) {

        addPageButton(
            container,
            page,
            false,
            function () {

                currentPage =
                    page;

                renderMembers();

            },
            currentPage === page
        );

    }


    addPageButton(
        container,
        "Next",
        currentPage === pages,
        function () {

            currentPage++;

            renderMembers();

        }
    );

}


/* =========================================================
   ADD PAGE BUTTON
========================================================= */

function addPageButton(
    container,
    text,
    disabled,
    action,
    active = false
) {

    const item =
        document.createElement(
            "div"
        );


    item.className =
        `page-item ${disabled
            ? "disabled"
            : ""
        } ${active
            ? "active"
            : ""
        }`;


    const button =
        document.createElement(
            "button"
        );


    button.type =
        "button";


    button.className =
        "page-link";


    button.textContent =
        text;


    button.disabled =
        disabled;


    if (!disabled) {

        button.addEventListener(
            "click",
            action
        );

    }


    item.appendChild(
        button
    );


    container.appendChild(
        item
    );

}


/* =========================================================
   ADD MEMBER
========================================================= */

function openAddMemberModal() {

    const form =
        document.getElementById(
            "memberForm"
        );


    if (form) {

        form.reset();

    }


    hideMemberFormError();


    setText(
        "memberModalTitle",
        "Add member"
    );


    setValue(
        "mTier",
        "Bronze"
    );


    setValue(
        "mStatus",
        "Active"
    );


    setValue(
        "mReferralBy",
        "N/A"
    );


    setValue(
        "mEmailSubcribe",
        "No"
    );


    setValue(
        "mNotificationStatus",
        "Active"
    );


    setValue(
        "mPassword",
        ""
    );


    const hint =
        document.getElementById(
            "passwordHint"
        );


    if (hint) {

        hint.textContent =
            "Required when creating a new member.";

    }


    const modal =
        document.getElementById(
            "memberModal"
        );


    if (!modal) {
        return;
    }


    modal.dataset.mode =
        "add";


    modal.dataset.memberId =
        "";


    showMemberModal();

}


/* =========================================================
   EDIT MEMBER
========================================================= */

async function editMember(id) {

    if (
        !id ||
        id <= 0
    ) {

        showMemberMessage(
            "Invalid member ID.",
            "danger"
        );

        return;

    }


    try {

        const response =
            await fetch(
                `/Admin/FindMemberById?id=${encodeURIComponent(id)}`,
                {
                    method:
                        "GET",

                    headers:
                    {
                        "X-Requested-With":
                            "XMLHttpRequest",

                        "Accept":
                            "application/json"
                    },

                    cache:
                        "no-store"
                }
            );


        if (
            response.status === 401
        ) {

            window.location.href =
                "/Admin/LoginPage";

            return;

        }


        const text =
            await response.text();


        let member;


        try {

            member =
                JSON.parse(text);

        }
        catch {

            throw new Error(
                text ||
                "Invalid member response."
            );

        }


        if (!response.ok) {

            throw new Error(
                member.message ||
                "Failed to load member."
            );

        }


        setValue(
            "mName",
            member.Name ||
            ""
        );


        setValue(
            "mEmail",
            member.Email ||
            ""
        );


        setValue(
            "mPhone",
            member.PhoneNumber ||
            ""
        );


        setValue(
            "mBirth",
            formatDateForInput(
                member.BirthDate
            )
        );


        setValue(
            "mTier",
            member.Tier ||
            "Bronze"
        );


        const accountStatus =
            String(
                member.AccountStatus ||
                ""
            )
                .toLowerCase();


        setValue(
            "mStatus",
            accountStatus ===
                "deactive" ||
                accountStatus ===
                "inactive"
                ? "Inactive"
                : "Active"
        );


        setValue(
            "mReferralBy",
            member.ReferralBy ||
            "N/A"
        );


        setValue(
            "mEmailSubcribe",
            member.EmailSubcribe ||
            "No"
        );


        setValue(
            "mNotificationStatus",
            member.NotificationStatus ||
            "Active"
        );


        setValue(
            "mPassword",
            ""
        );


        setText(
            "memberModalTitle",
            "Edit member"
        );


        const hint =
            document.getElementById(
                "passwordHint"
            );


        if (hint) {

            hint.textContent =
                "Leave blank to keep the current password.";

        }


        const modal =
            document.getElementById(
                "memberModal"
            );


        modal.dataset.mode =
            "edit";


        modal.dataset.memberId =
            id;


        showMemberModal();

    }
    catch (error) {

        console.error(
            "[EDIT ERROR]",
            error
        );


        showMemberMessage(
            error.message ||
            "Failed to load member.",
            "danger"
        );

    }

}


/* =========================================================
   SAVE MEMBER
   CREATE + EDIT
========================================================= */

async function saveMember() {

    const modal =
        document.getElementById(
            "memberModal"
        );


    if (!modal) {
        return;
    }


    const mode =
        modal.dataset.mode ||
        "add";


    const memberId =
        Number(
            modal.dataset.memberId ||
            0
        );


    const name =
        getValue("mName").trim();


    const email =
        getValue("mEmail").trim();


    const phone =
        getValue("mPhone").trim();


    const birth =
        getValue("mBirth").trim();


    const tier =
        getValue("mTier") ||
        "Bronze";


    const status =
        getValue("mStatus") ||
        "Active";


    const referralBy =
        getValue(
            "mReferralBy"
        ).trim() ||
        "N/A";


    const emailSubcribe =
        getValue(
            "mEmailSubcribe"
        ) ||
        "No";


    const notificationStatus =
        getValue(
            "mNotificationStatus"
        ) ||
        "Active";


    const password =
        getValue(
            "mPassword"
        );


    hideMemberFormError();


    if (!name) {

        showMemberFormError(
            "Name is required."
        );

        return;

    }


    if (!email) {

        showMemberFormError(
            "Email is required."
        );

        return;

    }


    if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
            .test(email)
    ) {

        showMemberFormError(
            "Please enter a valid email address."
        );

        return;

    }


    if (!phone) {

        showMemberFormError(
            "Phone number is required."
        );

        return;

    }


    if (
        mode === "add" &&
        !password
    ) {

        showMemberFormError(
            "Password is required."
        );

        return;

    }


    const accountStatus =
        status === "Inactive"
            ? "Deactive"
            : "Active";


    try {

        let url;

        let data;


        /* =====================================================
           CREATE
        ===================================================== */

        if (
            mode === "add"
        ) {

            url =
                "/Admin/CreateMember";


            data =
            {
                Name:
                    name,

                Email:
                    email,

                PhoneNumber:
                    phone,

                BirthDate:
                    birth,

                Password:
                    password,

                Tier:
                    tier,

                ReferralBy:
                    referralBy,

                EmailSubcribe:
                    emailSubcribe,

                NotificationStatus:
                    notificationStatus,

                AccountStatus:
                    accountStatus
            };

        }


        /* =====================================================
           EDIT
        ===================================================== */

        else {

            if (
                !memberId ||
                memberId <= 0
            ) {

                showMemberFormError(
                    "Invalid member ID."
                );

                return;

            }


            const existing =
                membersState.find(
                    function (member) {

                        return Number(
                            member.Id
                        ) === memberId;

                    }
                );


            url =
                "/Admin/EditMember";


            data =
            {
                Id:
                    memberId,

                UserId:
                    existing?.UserId ||
                    "",

                Name:
                    name,

                Email:
                    email,

                PhoneNumber:
                    phone,

                BirthDate:
                    birth,

                ReferralCode:
                    existing?.ReferralCode ||
                    "",

                ReferralBy:
                    referralBy,

                Password:
                    password ||
                    existing?.Password ||
                    "",

                Tier:
                    tier,

                Image:
                    existing?.Image ||
                    "",

                ImageByte:
                    existing?.ImageByte ||
                    "",

                FirstLogin:
                    existing?.FirstLogin ||
                    "",

                EmailSubcribe:
                    emailSubcribe,

                NotificationStatus:
                    notificationStatus,

                AccountStatus:
                    accountStatus,

                RegisterTime:
                    existing?.RegisterTime ||
                    "",

                DeviceId:
                    existing?.DeviceId ||
                    ""
            };

        }


        console.log(
            "[MEMBER SAVE]",
            url,
            data
        );


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
                            "application/json",

                        "X-Requested-With":
                            "XMLHttpRequest"
                    },

                    body:
                        JSON.stringify(
                            data
                        )
                }
            );


        const text =
            await response.text();


        let result =
            {};


        try {

            result =
                text
                    ? JSON.parse(
                        text
                    )
                    : {};

        }
        catch {

            result =
            {
                message:
                    text
            };

        }


        console.log(
            "[MEMBER SAVE RESPONSE]",
            response.status,
            result
        );


        if (!response.ok) {

            throw new Error(
                result.message ||
                "Failed to save member."
            );

        }


        closeMemberModal();


        showMemberMessage(
            mode === "add"
                ? "Member created successfully."
                : "Member updated successfully.",
            "success"
        );


        await loadMembers();

    }
    catch (error) {

        console.error(
            "[MEMBER SAVE ERROR]",
            error
        );


        showMemberFormError(
            error.message ||
            "Failed to save member."
        );

    }

}


/* =========================================================
   DELETE MEMBER
========================================================= */

async function deleteMember(
    id
) {

    if (
        !id ||
        id <= 0
    ) {

        showMemberMessage(
            "Invalid member ID.",
            "danger"
        );

        return;

    }


    const confirmed =
        window.confirm(
            `Deactivate member #${id}? The account will become inactive and can be shown again using the member filters.`
        );


    if (!confirmed) {
        return;
    }


    try {

        console.log(
            "[MEMBER DELETE]",
            id
        );


        const response =
            await fetch(
                `/Admin/DeleteMember?id=${encodeURIComponent(id)}`,
                {
                    method:
                        "POST",

                    headers:
                    {
                        "X-Requested-With":
                            "XMLHttpRequest",

                        "Accept":
                            "application/json"
                    }
                }
            );


        const text =
            await response.text();


        let result =
            {};


        try {

            result =
                text
                    ? JSON.parse(
                        text
                    )
                    : {};

        }
        catch {

            result =
            {
                message:
                    text
            };

        }


        console.log(
            "[MEMBER DELETE RESPONSE]",
            response.status,
            result
        );


        if (!response.ok) {

            throw new Error(
                result.message ||
                "Failed to delete member."
            );

        }


        showMemberMessage(
            `Member #${id} is now inactive.`,
            "success"
        );


        /*
         * API soft delete:
         * AccountStatus becomes Deactive.
         *
         * Hide the member immediately when Hide inactive is enabled.
         */

        const deactivatedMember =
            membersState.find(
                function (member) {
                    return Number(member.Id || 0) === Number(id);
                }
            );

        if (deactivatedMember) {
            deactivatedMember.AccountStatus = "Deactive";
            applyMemberFilters();
        }

        await loadMembers();

    }
    catch (error) {

        console.error(
            "[MEMBER DELETE ERROR]",
            error
        );


        showMemberMessage(
            error.message ||
            "Failed to delete member.",
            "danger"
        );

    }

}


/* =========================================================
   MODAL
========================================================= */

function showMemberModal() {

    const modal =
        document.getElementById(
            "memberModal"
        );


    if (!modal) {
        return;
    }


    modal.removeAttribute(
        "hidden"
    );


    document.body.style.overflow =
        "hidden";

}


function closeMemberModal() {

    const modal =
        document.getElementById(
            "memberModal"
        );


    if (!modal) {
        return;
    }


    modal.setAttribute(
        "hidden",
        ""
    );


    document.body.style.overflow =
        "";


    hideMemberFormError();

}


/* =========================================================
   LOADING
========================================================= */

function showMembersLoading() {

    const state =
        document.getElementById(
            "membersState"
        );


    const spinner =
        document.getElementById(
            "membersSpinner"
        );


    const text =
        document.getElementById(
            "membersStateText"
        );


    if (state) {

        state.style.display =
            "flex";

    }


    if (spinner) {

        spinner.style.display =
            "block";

    }


    if (text) {

        text.textContent =
            "Loading members...";

    }

}


function hideMembersLoading() {

    const state =
        document.getElementById(
            "membersState"
        );


    if (state) {

        state.style.display =
            "none";

    }

}


/* =========================================================
   ERROR
========================================================= */

function showMembersError(
    message
) {

    const state =
        document.getElementById(
            "membersState"
        );


    const spinner =
        document.getElementById(
            "membersSpinner"
        );


    const text =
        document.getElementById(
            "membersStateText"
        );


    if (state) {

        state.style.display =
            "flex";

    }


    if (spinner) {

        spinner.style.display =
            "none";

    }


    if (text) {

        text.textContent =
            message;

    }


    const body =
        document.getElementById(
            "membersTableBody"
        );


    if (body) {

        body.innerHTML = `
            <tr>
                <td
                    colspan="8"
                    style="
                        text-align:center;
                        padding:40px;
                        color:#a04c4c;
                    ">
                    ${escapeHtml(message)}
                </td>
            </tr>
        `;

    }

}


/* =========================================================
   MESSAGE
========================================================= */

function showMemberMessage(
    message,
    type = "success"
) {

    const element =
        document.getElementById(
            "memberMsg"
        );


    if (!element) {
        return;
    }


    element.hidden =
        false;


    element.classList.remove(
        "alert-success",
        "alert-danger",
        "alert-warning",
        "alert-info"
    );


    element.classList.add(
        `alert-${type}`
    );


    element.textContent =
        message;


    clearTimeout(
        element._messageTimer
    );


    element._messageTimer =
        setTimeout(
            function () {

                element.hidden =
                    true;

            },
            4000
        );

}


/* =========================================================
   FORM ERROR
========================================================= */

function showMemberFormError(
    message
) {

    const box =
        document.getElementById(
            "memberFormError"
        );


    const text =
        document.getElementById(
            "memberFormErrorText"
        );


    if (text) {

        text.textContent =
            message;

    }


    if (box) {

        box.hidden =
            false;

    }

}


function hideMemberFormError() {

    const box =
        document.getElementById(
            "memberFormError"
        );


    const text =
        document.getElementById(
            "memberFormErrorText"
        );


    if (box) {

        box.hidden =
            true;

    }


    if (text) {

        text.textContent =
            "";

    }

}


/* =========================================================
   HELPERS
========================================================= */

function getValue(
    id
) {

    const element =
        document.getElementById(
            id
        );


    return element
        ? element.value || ""
        : "";

}


function setValue(
    id,
    value
) {

    const element =
        document.getElementById(
            id
        );


    if (element) {

        element.value =
            value ?? "";

    }

}


function setText(
    id,
    value
) {

    const element =
        document.getElementById(
            id
        );


    if (element) {

        element.textContent =
            value ?? "";

    }

}


/* =========================================================
   DATE
========================================================= */

function formatDate(
    value
) {

    if (!value) {
        return "-";
    }


    const date =
        new Date(value);


    if (
        isNaN(
            date.getTime()
        )
    ) {

        return escapeHtml(
            String(value)
        );

    }


    return date.toLocaleDateString(
        "en-MY",
        {
            year:
                "numeric",

            month:
                "2-digit",

            day:
                "2-digit"
        }
    );

}


function formatDateForInput(
    value
) {

    if (!value) {
        return "";
    }


    const text =
        String(value);


    if (
        /^\d{4}-\d{2}-\d{2}$/
            .test(text)
    ) {

        return text;

    }


    const date =
        new Date(value);


    if (
        isNaN(
            date.getTime()
        )
    ) {

        return "";

    }


    const year =
        date.getFullYear();


    const month =
        String(
            date.getMonth() + 1
        )
            .padStart(
                2,
                "0"
            );


    const day =
        String(
            date.getDate()
        )
            .padStart(
                2,
                "0"
            );


    return `${year}-${month}-${day}`;

}


/* =========================================================
   ESCAPE
========================================================= */

function escapeHtml(
    value
) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        value ?? "";


    return div.innerHTML;

}


/* =========================================================
   GLOBAL FUNCTIONS
========================================================= */

window.loadMembers =
    loadMembers;

window.editMember =
    editMember;

window.deleteMember =
    deleteMember;

window.saveMember =
    saveMember;
