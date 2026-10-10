// Support both legacy fetch calls and adminFetch without sending tokens off-site.
(function () {
    "use strict";
    var originalFetch = window.fetch.bind(window);
    window.fetch = function (input, options) {
        var request = typeof Request !== "undefined" && input instanceof Request ? input : null;
        var url = new URL(request ? request.url : input, window.location.href);
        var method = String(options && options.method || request && request.method || "GET").toUpperCase();
        if (url.origin !== window.location.origin || !/^\/Admin(?:\/|$)/i.test(url.pathname)
            || /^(GET|HEAD|OPTIONS|TRACE)$/.test(method)) {
            return originalFetch(input, options);
        }
        var token = document.querySelector('meta[name="admin-request-token"]');
        var securedOptions = Object.assign({}, options);
        var headers = new Headers(options && options.headers || request && request.headers);
        if (token && token.content && !headers.has("RequestVerificationToken")) {
            headers.set("RequestVerificationToken", token.content);
        }
        securedOptions.headers = headers;
        return originalFetch(input, securedOptions);
    };
})();
