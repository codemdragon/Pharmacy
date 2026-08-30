/* ==========================================================================
   CMS RUNTIME - hydrates public pages from content.json
   --------------------------------------------------------------------------
   Public pages keep their static HTML as a fallback. Elements tagged with
   data-cms attributes get live values from content.json:

     data-cms="store.phone"              -> textContent
     data-cms-href="store.mapsUrl"       -> href (site paths made root-relative)
     data-cms-tel="store.phoneHref"      -> href = tel:<value>
     data-cms-action="contactPage.formspreeId" -> form action (Formspree)
     data-cms-options="contactPage.topics"     -> fills a <select> with options
     data-cms-hours                       -> renders the weekly hours grid
     data-cms-hours-summary               -> renders "Mon-Fri: ... Sat: ... Sun: ..."

   Injected sitewide by loader.js. Fails silently (keeps static content)
   if content.json cannot be loaded.
   ========================================================================== */
(function () {
    'use strict';

    var CONTENT_URL = (function () {
        var cs = document.currentScript;
        return cs && cs.src ? new URL('content.json', cs.src)
            .toString()
            .replace('/assets/content.json', '/content.json') : 'content.json';
    })();

    function rootPrefix() {
        var segs = window.location.pathname.split('/').filter(Boolean);
        var last = segs.length ? segs[segs.length - 1] : '';
        var depth = (last && last.indexOf('.') !== -1) ? segs.length - 1 : segs.length;
        return depth > 0 ? new Array(depth + 1).join('../') : './';
    }

    function resolve(obj, path) {
        try {
            return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
        } catch (e) { return undefined; }
    }

    function esc(s) {
        return String(s == null ? '' : s);
    }

    /* site path -> works from any page depth; absolute/tel/mailto/# pass through */
    function href(value) {
        var v = esc(value);
        if (!v || v.charAt(0) === '#' ||
            /^(https?:)?\/\//i.test(v) ||
            /^(tel:|mailto:)/i.test(v)) return v;
        return rootPrefix() + v.replace(/^\//, '');
    }

    function hoursSummary(hours) {
        if (!hours || !hours.length) return '';
        var parts = [];
        var start = 0;
        for (var i = 1; i <= hours.length; i++) {
            var prev = hours[i - 1] || {};
            var cur = hours[i] || {};
            if (i === hours.length || cur.time !== prev.time) {
                var a = hours[start], b = hours[i - 1];
                var label = (start === i - 1)
                    ? a.day
                    : a.day.slice(0, 3) + '–' + b.day.slice(0, 3);
                parts.push(label + ': ' + a.time);
                start = i;
            }
        }
        return parts.join('  •  ');
    }

    function apply(doc, data) {
        var root = doc || document;

        /* plain text */
        root.querySelectorAll('[data-cms]').forEach(function (el) {
            var v = resolve(data, el.getAttribute('data-cms'));
            if (v != null) el.textContent = esc(v);
        });

        /* links */
        root.querySelectorAll('[data-cms-href]').forEach(function (el) {
            var v = resolve(data, el.getAttribute('data-cms-href'));
            if (v != null) el.setAttribute('href', href(v));
        });

        /* phone links */
        root.querySelectorAll('[data-cms-tel]').forEach(function (el) {
            var v = resolve(data, el.getAttribute('data-cms-tel'));
            if (v != null) el.setAttribute('href', 'tel:' + esc(v).replace(/[^+\d]/g, ''));
        });

        /* form action (formspree) */
        root.querySelectorAll('[data-cms-action]').forEach(function (el) {
            var v = resolve(data, el.getAttribute('data-cms-action'));
            if (v != null && v !== 'YOUR_FORM_ID') {
                el.setAttribute('action', 'https://formspree.io/f/' + esc(v));
            }
        });

        /* select options */
        root.querySelectorAll('[data-cms-options]').forEach(function (el) {
            var list = resolve(data, el.getAttribute('data-cms-options'));
            if (Array.isArray(list) && list.length) {
                var current = el.value;
                el.innerHTML = '';
                list.forEach(function (opt) {
                    var o = document.createElement('option');
                    o.value = opt; o.textContent = opt;
                    el.appendChild(o);
                });
                if (current) el.value = current;
            }
        });

        /* weekly hours grid (Where Are We style) */
        root.querySelectorAll('[data-cms-hours]').forEach(function (el) {
            var hours = resolve(data, 'store.hours');
            if (!Array.isArray(hours) || !hours.length) return;
            el.innerHTML = '';
            var today = (new Date().getDay() + 6) % 7; /* Monday-first */
            hours.forEach(function (row, i) {
                var d = document.createElement('div');
                var t = document.createElement('div');
                d.className = 'day' + (i === today ? ' current-day' : '');
                t.className = 'time' + (i === today ? ' current-day' : '');
                d.textContent = row.day;
                t.textContent = row.time;
                el.appendChild(d);
                el.appendChild(t);
            });
        });

        /* hours one-liner */
        root.querySelectorAll('[data-cms-hours-summary]').forEach(function (el) {
            var s = hoursSummary(resolve(data, 'store.hours'));
            if (s) el.textContent = s;
        });

        /* mailto links (hidden with their .info-item when empty) */
        root.querySelectorAll('[data-cms-mailto]').forEach(function (el) {
            var v = resolve(data, el.getAttribute('data-cms-mailto'));
            var item = el.closest('.info-item');
            if (v != null && v !== '') {
                el.setAttribute('href', 'mailto:' + esc(v));
                el.style.display = '';
                if (item) item.style.display = '';
            } else {
                el.style.display = 'none';
                if (item) item.style.display = 'none';
            }
        });

        /* footer social icon row (rebuilt from the list) */
        root.querySelectorAll('[data-cms-social]').forEach(function (el) {
            var items = resolve(data, 'footer.social');
            if (!Array.isArray(items) || !items.length) return;
            el.innerHTML = '';
            items.forEach(function (s) {
                if (!s || !s.icon) return;
                var a = document.createElement('a');
                a.setAttribute('href', href(s.href));
                a.setAttribute('aria-label', esc(s.label || 'social link'));
                if (/^https?:/i.test(esc(s.href || ''))) {
                    a.setAttribute('target', '_blank');
                    a.setAttribute('rel', 'noopener');
                }
                var i = document.createElement('i');
                i.className = s.icon;
                a.appendChild(i);
                el.appendChild(a);
            });
        });
    }

    function boot(data) {
        window.CMS = { data: data, apply: apply };

        /* run once the header/footer components are in place */
        var tries = 0;
        function tryApply() {
            var footerReady = !document.getElementById('footer-container') ||
                !!document.querySelector('#footer-container .footer');
            if (footerReady || ++tries > 12) {
                apply(document, data);
                /* let the location page reposition its map if it wants to */
                if (typeof window.updateMapCoords === 'function') {
                    try {
                        window.updateMapCoords(data.store.lat, data.store.lng, data.store.zoom);
                    } catch (e) { /* map not on this page */ }
                }
            } else {
                setTimeout(tryApply, 250);
            }
        }
        tryApply();
    }

    fetch(CONTENT_URL)
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(boot)
        .catch(function () { /* static fallback content stays */ });
})();
