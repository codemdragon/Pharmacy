/* ==========================================================================
   SITE SEARCH
   --------------------------------------------------------------------------
   Makes the header search box actually search the whole website.

   - assets/search-index.json (built by tools/build-search-index.js) holds,
     for every page: the main title, the breadcrumb trail, all subheadings
     (h2/h3/h4) and the text that belongs to each of them.
   - On every page the header search box shows a live dropdown of quick
     results, grouped into Pages / Subheadings / In the content.
   - Pressing Enter (or the search button) opens search.html?q=... which
     shows the full results, cleanly separated into main titles,
     subheadings and content matches.

   Injected sitewide by loader.js. The pure matching logic is exposed as
   window.SiteSearch for testing.
   ========================================================================== */
(function () {
    'use strict';

    /* ------------------------------------------------------------ paths */

    var cs = (typeof document !== 'undefined') ? document.currentScript : null;
    var SCRIPT_URL = (cs && cs.src) ? cs.src : '';
    var ROOT_URL = SCRIPT_URL ? new URL('..', SCRIPT_URL).href : null;
    var INDEX_URL = SCRIPT_URL
        ? new URL('search-index.json', SCRIPT_URL).href
        : 'assets/search-index.json';
    var SEARCH_PAGE = 'search.html';

    function pageUrl(url) {
        if (ROOT_URL) { try { return new URL(url, ROOT_URL).href; } catch (e) { /* noop */ } }
        return url;
    }

    function searchPageUrl(query) {
        var base = pageUrl(SEARCH_PAGE);
        return query ? base + '?q=' + encodeURIComponent(query) : base;
    }

    /* ----------------------------------------------------- text helpers */

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function escapeRegExp(s) {
        return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /* Case + accent folding ("Diabète" -> "diabete"). buildFoldMap also
       returns a map from folded-char index back to the original-char index,
       so matches found in the folded string can highlight the original. */
    function foldWithMap(text) {
        var folded = '', map = [];
        text = String(text == null ? '' : text);
        for (var i = 0; i < text.length; i++) {
            var f = text.charAt(i).toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            for (var j = 0; j < f.length; j++) { folded += f.charAt(j); map.push(i); }
        }
        return { folded: folded, map: map };
    }

    function fold(text) { return foldWithMap(text).folded; }

    var STOP_WORDS = ('a an and are as at be but by for from has have how i in is it its of ' +
        'on or our so that the their them they this to was we were what when where which who ' +
        'will with you your').split(' ');
    var STOP_MAP = {};
    STOP_WORDS.forEach(function (w) { STOP_MAP[w] = true; });

    function tokenize(query) {
        var terms = fold(query).split(/[^a-z0-9']+/).filter(function (t) {
            return t.length >= 2;
        });
        var seen = {}, out = [];
        terms.forEach(function (t) {
            if (!seen[t]) { seen[t] = true; out.push(t); }
        });
        /* drop filler words unless the query is only filler words */
        var meaningful = out.filter(function (t) { return !STOP_MAP[t]; });
        return meaningful.length ? meaningful : out;
    }

    function allTermsIn(foldedText, terms) {
        for (var i = 0; i < terms.length; i++) {
            if (foldedText.indexOf(terms[i]) === -1) return false;
        }
        return true;
    }

    function scoreField(foldedText, terms, base) {
        var score = base;
        if (terms.length > 1 && foldedText.indexOf(terms.join(' ')) !== -1) score += 40;
        for (var i = 0; i < terms.length; i++) {
            try {
                if (new RegExp('\\b' + escapeRegExp(terms[i]) + '\\b').test(foldedText)) score += 10;
            } catch (e) { /* noop */ }
        }
        return score;
    }

    /* Find every occurrence of every term; returns merged [start, end)
       ranges over the ORIGINAL text. */
    function findRanges(text, terms) {
        var fm = foldWithMap(text);
        var folded = fm.folded, map = fm.map;
        var ranges = [];
        terms.forEach(function (t) {
            var idx = 0;
            while (true) {
                var found = folded.indexOf(t, idx);
                if (found === -1) break;
                var end = found + t.length - 1;
                if (end < map.length) ranges.push([map[found], map[end] + 1]);
                idx = found + t.length;
            }
        });
        ranges.sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
        var merged = [];
        ranges.forEach(function (r) {
            var last = merged[merged.length - 1];
            if (last && r[0] <= last[1]) { if (r[1] > last[1]) last[1] = r[1]; }
            else merged.push([r[0], r[1]]);
        });
        return merged;
    }

    /* Escaped HTML with every term wrapped in <mark>. */
    function highlightHtml(text, terms) {
        text = String(text == null ? '' : text);
        var ranges = findRanges(text, terms);
        if (!ranges.length) return escapeHtml(text);
        var out = '', pos = 0;
        ranges.forEach(function (r) {
            out += escapeHtml(text.slice(pos, r[0]));
            out += '<mark>' + escapeHtml(text.slice(r[0], r[1])) + '</mark>';
            pos = r[1];
        });
        return out + escapeHtml(text.slice(pos));
    }

    /* A short window of text around the first term occurrence. */
    function makeSnippet(text, terms, radius) {
        radius = radius || 90;
        var fm = foldWithMap(text);
        var first = -1, term = '';
        for (var i = 0; i < terms.length; i++) {
            var at = fm.folded.indexOf(terms[i]);
            if (at !== -1 && (first === -1 || at < first)) { first = at; term = terms[i]; }
        }
        if (first === -1) return null;
        var anchor = fm.map[first];
        var start = Math.max(0, anchor - radius);
        var end = Math.min(text.length, anchor + term.length + radius);
        /* snap to word edges so we never cut a word in half */
        if (start > 0) {
            var sp = text.indexOf(' ', start);
            if (sp !== -1 && sp < anchor) start = sp + 1;
        }
        if (end < text.length) {
            var sp2 = text.lastIndexOf(' ', end);
            if (sp2 > anchor) end = sp2;
        }
        var prefix = start > 0 ? '\u2026 ' : '';
        var suffix = end < text.length ? ' \u2026' : '';
        return prefix + text.slice(start, end).trim() + suffix;
    }

    /* --------------------------------------------------- matching engine */

    function runSearch(query, index) {
        var terms = tokenize(query);
        var result = {
            query: String(query == null ? '' : query).trim(),
            terms: terms,
            titles: [], headings: [], contents: [], total: 0
        };
        if (!terms.length || !index || !Array.isArray(index.pages)) return result;

        index.pages.forEach(function (page) {
            var titleFolded = fold(page.title);

            /* 1 - main titles */
            if (allTermsIn(titleFolded, terms)) {
                result.titles.push({
                    page: page,
                    score: scoreField(titleFolded, terms, 120)
                });
            }

            var contentHits = [];
            (page.sections || []).forEach(function (s) {
                /* 2 - subheadings */
                if (s.h) {
                    var hFolded = fold(s.h);
                    if (allTermsIn(hFolded, terms)) {
                        result.headings.push({
                            page: page,
                            section: s,
                            score: scoreField(hFolded, terms, 80),
                            snippet: makeSnippet(s.text || page.intro || '', terms, 70) || ''
                        });
                    }
                }
                /* 3 - content */
                if (s.text) {
                    var tFolded = fold(s.text);
                    if (allTermsIn(tFolded, terms)) {
                        var snip = makeSnippet(s.text, terms, 90);
                        if (snip) {
                            contentHits.push({
                                page: page,
                                section: s,
                                snippet: snip,
                                score: scoreField(tFolded, terms, 30)
                            });
                        }
                    }
                }
            });

            contentHits.sort(function (a, b) { return b.score - a.score; });
            contentHits.slice(0, 3).forEach(function (h) { result.contents.push(h); });
        });

        var byScore = function (a, b) { return b.score - a.score; };
        result.titles.sort(byScore);
        result.headings.sort(byScore);
        result.contents.sort(byScore);
        result.total = result.titles.length + result.headings.length + result.contents.length;
        return result;
    }

    /* ------------------------------------------------------ index cache */

    var indexPromise = null;
    function loadIndex() {
        if (!indexPromise) {
            indexPromise = fetch(INDEX_URL, { credentials: 'same-origin' })
                .then(function (r) {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.json();
                })
                .catch(function (err) {
                    indexPromise = null; /* allow retry */
                    throw err;
                });
        }
        return indexPromise;
    }

    /* ------------------------------------------------- shared rendering */

    function crumbText(page) {
        return (page.crumb || []).join(' \u203A ');
    }

    function renderDropdown(res) {
        var CAP = 3, html = '';

        function item(url, meta, titleHtml, snippetHtml) {
            return '<a class="sd-item" href="' + escapeHtml(url) + '">' +
                (meta ? '<span class="sd-meta">' + meta + '</span>' : '') +
                '<span class="sd-title">' + titleHtml + '</span>' +
                (snippetHtml ? '<span class="sd-snippet">' + snippetHtml + '</span>' : '') +
                '</a>';
        }

        if (res.titles.length) {
            html += '<div class="sd-label">Pages</div>';
            res.titles.slice(0, CAP).forEach(function (h) {
                var p = h.page;
                html += item(pageUrl(p.url), escapeHtml(crumbText(p)),
                    highlightHtml(p.title, res.terms),
                    p.intro ? highlightHtml(p.intro, res.terms) : '');
            });
        }
        if (res.headings.length) {
            html += '<div class="sd-label">Subheadings</div>';
            res.headings.slice(0, CAP).forEach(function (h) {
                var p = h.page;
                html += item(pageUrl(p.url),
                    escapeHtml(crumbText(p) + ' \u00B7 ' + p.title),
                    highlightHtml(h.section.h, res.terms),
                    h.snippet ? highlightHtml(h.snippet, res.terms) : '');
            });
        }
        if (res.contents.length) {
            html += '<div class="sd-label">In the content</div>';
            res.contents.slice(0, CAP).forEach(function (h) {
                var p = h.page;
                var meta = p.title + (h.section.h ? ' \u203A ' + h.section.h : '');
                html += item(pageUrl(p.url), escapeHtml(meta),
                    highlightHtml(h.snippet, res.terms), '');
            });
        }

        if (!html) {
            html = '<div class="sd-empty">No results for \u201C' +
                escapeHtml(res.query) + '\u201D</div>';
        }
        html += '<a class="sd-footer" href="' + escapeHtml(searchPageUrl(res.query)) + '">' +
            'See all results for \u201C' + escapeHtml(res.query) + '\u201D' +
            ' <i class="fas fa-arrow-right"></i></a>';
        return html;
    }

    function renderResultsPage(res) {
        var MAX_TITLES = 30, MAX_HEAD_PAGES = 20, MAX_HEADS = 5, MAX_CONTENT = 30;

        if (!res.terms.length) {
            return '<div class="sr-empty"><i class="fas fa-magnifying-glass"></i>' +
                '<h3>Type something to search</h3>' +
                '<p>Search across every page of the site \u2014 titles, subheadings and content.</p></div>';
        }
        if (!res.total) {
            return '<div class="sr-empty"><i class="fas fa-circle-question"></i>' +
                '<h3>No results for \u201C' + escapeHtml(res.query) + '\u201D</h3>' +
                '<p>Try different or fewer keywords \u2014 for example \u201Cflu\u201D, ' +
                '\u201Cdiabetes\u201D, \u201Crenewal\u201D or \u201Cvaccine\u201D.</p></div>';
        }

        var html = '<p class="sr-summary"><strong>' + res.total + '</strong> ' +
            (res.total === 1 ? 'match' : 'matches') + ' for \u201C' + escapeHtml(res.query) +
            '\u201D \u2014 ' + res.titles.length + ' page ' +
            (res.titles.length === 1 ? 'title' : 'titles') + ', ' +
            res.headings.length + ' subheading ' +
            (res.headings.length === 1 ? 'match' : 'matches') + ', ' +
            res.contents.length + ' content ' +
            (res.contents.length === 1 ? 'match' : 'matches') + '</p>';

        /* --- Group 1: main titles --- */
        if (res.titles.length) {
            html += '<section class="sr-group"><h2 class="sr-group-title">' +
                '<i class="fas fa-file-lines"></i> Main titles</h2><div class="sr-list">';
            res.titles.slice(0, MAX_TITLES).forEach(function (h) {
                var p = h.page;
                html += '<a class="sr-card sr-title-card" href="' + escapeHtml(pageUrl(p.url)) + '">' +
                    '<span class="sr-crumb">' + escapeHtml(crumbText(p)) + '</span>' +
                    '<span class="sr-title">' + highlightHtml(p.title, res.terms) + '</span>' +
                    (p.intro ? '<span class="sr-snippet">' +
                        highlightHtml(p.intro, res.terms) + '</span>' : '') +
                    '<span class="sr-open">Open page <i class="fas fa-arrow-right"></i></span>' +
                    '</a>';
            });
            html += '</div></section>';
        }

        /* --- Group 2: subheadings, clustered per page --- */
        if (res.headings.length) {
            html += '<section class="sr-group"><h2 class="sr-group-title">' +
                '<i class="fas fa-heading"></i> Subheadings</h2><div class="sr-list">';
            var byPage = [], pageIndex = {};
            res.headings.forEach(function (h) {
                var key = h.page.url;
                if (!pageIndex[key]) {
                    pageIndex[key] = { page: h.page, items: [] };
                    byPage.push(pageIndex[key]);
                }
                pageIndex[key].items.push(h);
            });
            byPage.slice(0, MAX_HEAD_PAGES).forEach(function (group) {
                var p = group.page;
                html += '<div class="sr-card sr-heading-card">' +
                    '<a class="sr-page-line" href="' + escapeHtml(pageUrl(p.url)) + '">' +
                    '<span class="sr-crumb">' + escapeHtml(crumbText(p)) + '</span>' +
                    '<span class="sr-title">' + escapeHtml(p.title) + '</span></a>' +
                    '<ul class="sr-subhits">';
                group.items.slice(0, MAX_HEADS).forEach(function (h) {
                    html += '<li><a href="' + escapeHtml(pageUrl(p.url)) + '">' +
                        '<span class="sr-subtitle"><i class="fas fa-caret-right"></i> ' +
                        highlightHtml(h.section.h, res.terms) + '</span>' +
                        (h.snippet ? '<span class="sr-snippet">' +
                            highlightHtml(h.snippet, res.terms) + '</span>' : '') +
                        '</a></li>';
                });
                if (group.items.length > MAX_HEADS) {
                    html += '<li class="sr-more"><a href="' + escapeHtml(pageUrl(p.url)) +
                        '">and ' + (group.items.length - MAX_HEADS) +
                        ' more section' + (group.items.length - MAX_HEADS > 1 ? 's' : '') +
                        ' on this page\u2026</a></li>';
                }
                html += '</ul></div>';
            });
            html += '</div></section>';
        }

        /* --- Group 3: content matches --- */
        if (res.contents.length) {
            html += '<section class="sr-group"><h2 class="sr-group-title">' +
                '<i class="fas fa-align-left"></i> Content on the pages</h2><div class="sr-list">';
            res.contents.slice(0, MAX_CONTENT).forEach(function (h) {
                var p = h.page;
                var meta = crumbText(p) + ' \u00B7 ' + p.title +
                    (h.section.h ? ' \u203A ' + h.section.h : '');
                html += '<a class="sr-card sr-content-card" href="' +
                    escapeHtml(pageUrl(p.url)) + '">' +
                    '<span class="sr-crumb">' + escapeHtml(meta) + '</span>' +
                    '<span class="sr-snippet">' + highlightHtml(h.snippet, res.terms) +
                    '</span></a>';
            });
            html += '</div></section>';
        }
        return html;
    }

    /* ------------------------------------------------------------ styles */

    var DROPDOWN_CSS = [
        '.search-container{position:relative;}',
        '.search-dropdown{position:absolute;top:calc(100% + 10px);right:0;width:400px;',
        'max-width:88vw;background:#fff;border-radius:14px;box-shadow:0 14px 40px rgba(15,35,60,.22);',
        'z-index:2200;display:none;overflow:hidden;text-align:left;border:1px solid #e3e9f1;}',
        '.search-dropdown.open{display:block;animation:sdIn .16s ease;}',
        '@keyframes sdIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}',
        '.side-nav .search-dropdown{left:0;right:0;width:auto;max-width:none;top:calc(100% + 4px);}',
        '.side-nav .search-container input{width:auto;flex:1;min-width:0;}',
        '.sd-label{font:600 11px/1 Poppins,sans-serif;letter-spacing:.8px;text-transform:uppercase;',
        'color:#8593a5;padding:12px 16px 6px;background:#fff;}',
        '.sd-item{display:block;padding:8px 16px 10px;text-decoration:none;color:#333;',
        'border-bottom:1px solid #f0f3f7;transition:background .15s ease;}',
        '.sd-item:hover,.sd-item.active{background:#eef5fd;}',
        '.sd-meta{display:block;font-size:11px;color:#8593a5;margin-bottom:2px;',
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.sd-title{display:block;font:600 14px/1.35 Poppins,sans-serif;color:#0056b3;}',
        '.sd-snippet{display:block;font-size:12.5px;color:#5b6572;margin-top:2px;',
        'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
        '.sd-empty{padding:18px 16px;color:#6c757d;font-size:14px;}',
        '.sd-footer{display:block;padding:11px 16px;background:#f2f6fb;text-align:center;',
        'font:600 13px Poppins,sans-serif;color:#0056b3;text-decoration:none;}',
        '.sd-footer:hover{background:#e5eef9;}',
        '.search-dropdown mark,.sr-list mark,.search-big mark{background:#ffe9a3;color:inherit;',
        'padding:0 2px;border-radius:3px;}'
    ].join('\n');

    function injectStyles() {
        if (typeof document === 'undefined') return;
        if (document.getElementById('site-search-styles')) return;
        var style = document.createElement('style');
        style.id = 'site-search-styles';
        style.textContent = DROPDOWN_CSS;
        document.head.appendChild(style);
    }

    /* ------------------------------------------------ header quick search */

    function setupSearchBox(container) {
        if (!container || container.getAttribute('data-search-init')) return;
        container.setAttribute('data-search-init', '1');

        var input = container.querySelector('input');
        var button = container.querySelector('button');
        if (!input) return;

        var dd = document.createElement('div');
        dd.className = 'search-dropdown';
        container.appendChild(dd);

        var items = [], active = -1, timer = null;

        function close() {
            dd.classList.remove('open');
            dd.innerHTML = '';
            items = []; active = -1;
            input.setAttribute('aria-expanded', 'false');
        }

        function open(html) {
            dd.innerHTML = html;
            dd.classList.add('open');
            items = Array.prototype.slice.call(dd.querySelectorAll('a[href]'));
            active = -1;
            input.setAttribute('aria-expanded', 'true');
        }

        function setActive(i) {
            if (i < 0) i = items.length - 1;
            if (i >= items.length) i = 0;
            if (!items.length) return;
            if (active >= 0 && items[active]) items[active].classList.remove('active');
            active = i;
            items[active].classList.add('active');
            if (items[active].scrollIntoView) items[active].scrollIntoView({ block: 'nearest' });
        }

        function goResults() {
            var q = input.value.trim();
            if (!q) return;
            closeSideNav();
            window.location.href = searchPageUrl(q);
        }

        function closeSideNav() {
            var sideNav = document.querySelector('.side-nav');
            var overlay = document.getElementById('overlay');
            if (sideNav) sideNav.classList.remove('open');
            if (overlay) overlay.classList.remove('open');
        }

        function update() {
            var q = input.value.trim();
            if (q.length < 2) { close(); return; }
            loadIndex().then(function (index) {
                /* ignore stale responses from older keystrokes */
                if (input.value.trim() !== q) return;
                open(renderDropdown(runSearch(q, index)));
            }).catch(function () {
                open('<div class="sd-empty">Search is unavailable right now \u2014 please try again.</div>');
            });
        }

        input.addEventListener('input', function () {
            clearTimeout(timer);
            timer = setTimeout(update, 140);
        });
        input.addEventListener('focus', function () {
            if (input.value.trim().length >= 2 && !dd.classList.contains('open')) update();
        });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (!dd.classList.contains('open')) update(); else setActive(active + 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault(); setActive(active - 1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (active >= 0 && items[active]) items[active].click();
                else goResults();
            } else if (e.key === 'Escape') {
                close();
            }
        });
        if (button) {
            button.addEventListener('click', function (e) {
                e.preventDefault();
                goResults();
            });
        }
    }

    function bindAllSearchBoxes() {
        if (typeof document === 'undefined') return;
        var boxes = document.querySelectorAll('.search-container:not([data-search-init])');
        Array.prototype.forEach.call(boxes, setupSearchBox);
    }

    /* ------------------------------------------------- full results page */

    function initResultsPage() {
        var input = document.getElementById('search-page-input');
        var button = document.getElementById('search-page-btn');
        var out = document.getElementById('search-results');
        if (!input || !out) return false;

        function currentQuery() {
            try { return new URLSearchParams(window.location.search).get('q') || ''; }
            catch (e) { return ''; }
        }

        function render(query) {
            input.value = query;
            var q = query.trim();
            if (!q) {
                out.innerHTML = renderResultsPage({ query: '', terms: [], titles: [], headings: [], contents: [], total: 0 });
                input.focus();
                return;
            }
            out.innerHTML = '<div class="sr-loading"><i class="fas fa-circle-notch fa-spin"></i>' +
                '<span>Searching every page\u2026</span></div>';
            loadIndex().then(function (index) {
                out.innerHTML = renderResultsPage(runSearch(q, index));
            }).catch(function () {
                out.innerHTML = '<div class="sr-empty"><i class="fas fa-triangle-exclamation"></i>' +
                    '<h3>Search index could not be loaded</h3>' +
                    '<p>Please check your connection and try again.</p></div>';
            });
        }

        function submit() {
            var q = input.value.trim();
            var target = 'search.html' + (q ? '?q=' + encodeURIComponent(q) : '');
            try { window.history.replaceState(null, '', target); } catch (e) { /* noop */ }
            render(q);
        }

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
        });
        if (button) button.addEventListener('click', function (e) {
            e.preventDefault(); submit();
        });

        render(currentQuery());
        return true;
    }

    /* ------------------------------------------------------------- boot */

    var api = {
        fold: fold,
        tokenize: tokenize,
        runSearch: runSearch,
        highlightHtml: highlightHtml,
        makeSnippet: makeSnippet,
        loadIndex: loadIndex,
        pageUrl: pageUrl,
        searchPageUrl: searchPageUrl,
        renderDropdown: renderDropdown,
        renderResultsPage: renderResultsPage
    };

    if (typeof window !== 'undefined') window.SiteSearch = api;

    if (typeof document !== 'undefined') {
        function boot() {
            injectStyles();
            initResultsPage();
            bindAllSearchBoxes();
            window.addEventListener('headerLoaded', bindAllSearchBoxes);
            /* safety net for headers injected without the event */
            if (typeof MutationObserver !== 'undefined') {
                var mo = new MutationObserver(function () {
                    if (document.querySelector('.search-container:not([data-search-init])')) {
                        bindAllSearchBoxes();
                    }
                });
                mo.observe(document.documentElement, { childList: true, subtree: true });
            }
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', boot);
        } else {
            boot();
        }
    }
})();
