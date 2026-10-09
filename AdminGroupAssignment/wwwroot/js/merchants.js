"use strict";


document.addEventListener(
    "DOMContentLoaded",
    function () {

        initializeMerchantPage();

    }
);


/* =====================================================
   INITIALIZE
===================================================== */

function initializeMerchantPage() {

    const cards =
        document.querySelectorAll(
            ".merchant-category"
        );


    cards.forEach(
        function (card) {

            card.addEventListener(
                "click",
                function () {

                    console.log(
                        "[MERCHANT PAGE] Opening:",
                        card
                            .querySelector("h3")
                            ?.textContent
                            .trim()
                    );

                }
            );

        }
    );

}


/* =====================================================
   GLOBAL
===================================================== */

window.initializeMerchantPage =
    initializeMerchantPage;