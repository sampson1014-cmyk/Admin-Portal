// admin.js - shared by every admin page (sidebar open/close on mobile)
(function () {
    "use strict";

    var body = document.body;
    var menuBtn = document.getElementById("menuBtn");
    var scrim = document.getElementById("scrim");
    var groupToggles = document.querySelectorAll(".sidebar-group-toggle");

    window.adminFetch = function (input, options) {
        var requestOptions = options ? Object.assign({}, options) : {};

        // Pages that already manage cancellation keep control of their own signal.
        if (requestOptions.signal) return window.fetch(input, requestOptions);

        var controller = new AbortController();
        var timedOut = false;
        var timeout = window.setTimeout(function () {
            timedOut = true;
            controller.abort();
        }, 25000);
        requestOptions.signal = controller.signal;

        return window.fetch(input, requestOptions).catch(function (error) {
            if (timedOut && error && error.name === "AbortError") {
                throw new Error("The server took too long to respond. Please select Refresh and try again.");
            }
            throw error;
        }).finally(function () {
            window.clearTimeout(timeout);
        });
    };

    function setOpen(open) {
        body.classList.toggle("nav-open", open);
        if (menuBtn) menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    if (menuBtn) {
        menuBtn.addEventListener("click", function () {
            setOpen(!body.classList.contains("nav-open"));
        });
    }

    if (scrim) {
        scrim.addEventListener("click", function () { setOpen(false); });
    }

    groupToggles.forEach(function (toggle) {
        toggle.addEventListener("click", function () {
            var group = toggle.closest(".sidebar-nav-group");
            if (!group) return;
            var open = !group.classList.contains("open");
            group.classList.toggle("open", open);
            toggle.setAttribute("aria-expanded", open ? "true" : "false");
        });
    });

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") setOpen(false);
    });
})();
