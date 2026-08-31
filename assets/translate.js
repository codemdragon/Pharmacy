/* ==========================================================================
   Sitewide EN <-> FR translation (works on every page, no keys required)
   --------------------------------------------------------------------------
   Engine: Google Website Translator element (translate_a/element.js).
   - First click on "Français" sets the googtrans cookie (/en/fr) and the
     widget translates the whole page.
   - The cookie persists the choice, so every other page loads in French
     automatically.
   - Clicking again (the link becomes "English") resets the cookie (/en/en).
   The link is bound with event delegation, so it works inside the
   dynamically-injected header on every page.
   ========================================================================== */
(function () {
    'use strict';

    var COOKIE = 'googtrans';

    function setCookie(value) {
        var d = new Date();
        d.setTime(d.getTime() + 365 * 24 * 60 * 60 * 1000);
        document.cookie = COOKIE + '=' + value + ';expires=' + d.toUTCString() + ';path=/';
    }

    function getCookie() {
        var m = document.cookie.match('(?:^|;\\s*)' + COOKIE + '=([^;]*)');
        return m ? decodeURIComponent(m[1]) : '';
    }

    function currentLang() {
        return getCookie().split('/').pop() === 'fr' ? 'fr' : 'en';
    }

    /* --- Google widget bootstrap --- */
    window.pharmacyTranslateInit = function () {
        try {
            new google.translate.TranslateElement({
                pageLanguage: 'en',
                includedLanguages: 'fr',
                autoDisplay: false
            }, 'pharmacy-google-translate');
        } catch (e) {
            /* widget unavailable - link simply won't translate */
        }
    };

    function loadEngine() {
        if (document.getElementById('pharmacy-google-translate')) return;
        var holder = document.createElement('div');
        holder.id = 'pharmacy-google-translate';
        holder.style.display = 'none';
        document.body.appendChild(holder);

        var s = document.createElement('script');
        s.src = 'https://translate.google.com/translate_a/element.js?cb=pharmacyTranslateInit';
        document.head.appendChild(s);
    }

    /* --- Toggle --- */
    function toggle() {
        if (currentLang() === 'fr') {
            setCookie('/en/en');
        } else {
            setCookie('/en/fr');
            loadEngine();
        }
        window.location.reload();
    }

    document.addEventListener('click', function (e) {
        var link = e.target.closest ? e.target.closest('#lang-toggle, .lang-toggle') : null;
        if (!link) return;
        e.preventDefault();
        toggle();
    });

    /* --- Keep the link label in sync (header is injected async) --- */
    function syncLabel() {
        var labels = currentLang() === 'fr' ? 'English' : 'Français';
        var links = document.querySelectorAll('#lang-toggle, .lang-toggle');
        Array.prototype.forEach.call(links, function (link) { link.textContent = labels; });
    }

    window.addEventListener('headerLoaded', syncLabel);
    document.addEventListener('DOMContentLoaded', function () {
        loadEngine();
        syncLabel();
    });
    if (document.readyState !== 'loading') {
        loadEngine();
        syncLabel();
    }
})();
