/* ==========================================================================
   CENTRAL MOTION ENGINE (vanilla adaptation)
   --------------------------------------------------------------------------
   Auto-tags existing page structures with scroll reveals - no HTML edits
   needed on any page. Pairs with assets/motion.css (injected together).

   Implemented rules from the motion architecture doc:
   - IntersectionObserver with once:true (one-and-done reveal rule)
   - Staggered grid children (0.06s per item, capped at 0.3s)
   - 16px max travel, emphasized-out easing, 0.6s scroll duration
   - will-change cleared after completion (GPU memory safeguard)
   - prefers-reduced-motion -> instant reveals, zero movement
   - No-JS -> nothing is ever hidden (hidden state is applied by JS only)
   ========================================================================== */
(function () {
    'use strict';

    var reduced = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Grids whose children get the staggered sequence */
    var GROUPS = [
        '.services-grid',   /* home + suggested services + where_are_we amenities */
        '.info-grid',       /* card grids on all service/health pages */
        '.options-grid',    /* renewals */
        '.test-grid',       /* respiratory assessments */
        '.vaccine-grid',    /* vaccinations */
        '.pharmacy-grid'    /* myhealth pages */
    ];

    /* Blocks that reveal as one unit */
    var ITEMS = [
        '.info-box',                     /* grey info sections */
        '.local-card',                   /* who we are */
        '.visit-card',                   /* vaccinations visit-us card */
        '.quality-content',              /* home quality section */
        '.subscription-content',         /* home subscription section */
        '.section > h2'                  /* section headings */
    ];

    /* Directional entrances: slide in from the sides (16px, capped) */
    var SIDE_L = [
        '.intro > .intro-text',          /* sub-page intro text */
        '.location-wrapper .map-section',/* where are we: map */
        '.contact-wrapper .info-card'    /* contact: store info */
    ];

    var SIDE_R = [
        '.intro > img',                  /* sub-page intro image */
        '.location-wrapper .info-card',  /* where are we: hours card */
        '.contact-wrapper .form-card'    /* contact: form */
    ];

    function tag(el, delay, side) {
        if (el.classList.contains('mr')) return;
        el.classList.add('mr');
        if (side) el.classList.add(side);
        if (delay) el.setAttribute('data-mr-delay', delay);
    }

    function init() {
        try {
            setupFooterReveal();
            runReveals();
        } catch (e) {
            /* absolute fail-safe: show everything rather than risk a blank page */
            revealAllNow();
        }
    }

    function revealAllNow() {
        document.querySelectorAll('.mr:not(.revealed)').forEach(function (el) {
            el.classList.add('revealed', 'done');
        });
    }

    function runReveals() {

        /* Tag staggered grid children */
        GROUPS.forEach(function (sel) {
            document.querySelectorAll(sel).forEach(function (group) {
                Array.prototype.forEach.call(group.children, function (child, i) {
                    tag(child, Math.min(i * 0.06, 0.3));
                });
            });
        });

        /* Alternating category blocks: odd from the left, even from the right */
        Array.prototype.forEach.call(
            document.querySelectorAll('.health-block'),
            function (el, i) {
                tag(el, 0, i % 2 === 0 ? 'mr-side-l' : 'mr-side-r');
            }
        );

        /* Directional pairs: left content first, right content follows in */
        SIDE_L.forEach(function (sel) {
            document.querySelectorAll(sel).forEach(function (el) { tag(el, 0, 'mr-side-l'); });
        });
        SIDE_R.forEach(function (sel) {
            document.querySelectorAll(sel).forEach(function (el) { tag(el, 0.08, 'mr-side-r'); });
        });

        /* Tag standalone blocks */
        ITEMS.forEach(function (sel) {
            document.querySelectorAll(sel).forEach(function (el) { tag(el); });
        });

        var all = document.querySelectorAll('.mr');

        /* Reduced motion or no observer support: instant structural reveal */
        if (reduced || !('IntersectionObserver' in window)) {
            all.forEach ? all.forEach(function (el) {
                el.classList.add('revealed', 'done');
            }) : Array.prototype.forEach.call(all, function (el) {
                el.classList.add('revealed', 'done');
            });
            return;
        }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;

                var el = entry.target;
                io.unobserve(el); /* once: true - one-and-done reveal */

                var delay = parseFloat(el.getAttribute('data-mr-delay') || '0');
                if (delay) el.style.transitionDelay = delay + 's';

                el.addEventListener('transitionend', function clear() {
                    el.removeEventListener('transitionend', clear);
                    el.style.transitionDelay = '';
                    el.classList.add('done'); /* clear will-change */
                });

                el.classList.add('revealed');
            });
        }, {
            threshold: 0.15,
            rootMargin: '0px 0px -10% 0px' /* reveal near the 85% threshold */
        });

        Array.prototype.forEach.call(all, function (el) { io.observe(el); });

        /* SAFETY NET: if anything ever prevents an in-view element from
           being revealed (observer hiccup, hidden parent, timer clash),
           force-reveal anything visible in the viewport after 3.5s. */
        setTimeout(function () {
            document.querySelectorAll('.mr:not(.revealed)').forEach(function (el) {
                var r = el.getBoundingClientRect();
                if (r.top < window.innerHeight && r.bottom > 0) {
                    el.classList.add('revealed', 'done');
                }
            });
        }, 3500);
    }

    /* ===== Progressive reveal footer ====================================
       Wraps every top-level content node in one opaque .content-shell so
       the sticky footer can sit behind the page WITHOUT showing through
       the gaps between sections (margins) on sectioned pages. */
    function setupFooterReveal() {
        if (reduced) return;
        var footer = document.getElementById('footer-container');
        if (!footer || document.body.classList.contains('has-shell')) return;

        var SKIP_IDS = { 'footer-container': 1, 'overlay': 1, 'universal-loader': 1 };
        var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, LINK: 1, NOSCRIPT: 1, META: 1 };

        var shell = document.createElement('div');
        shell.className = 'content-shell';

        var inserted = false;
        Array.prototype.slice.call(document.body.children).forEach(function (node) {
            if (node === shell) return;
            if (SKIP_TAGS[node.tagName]) return;
            if (node.id && SKIP_IDS[node.id]) return;
            if (node.classList && (node.classList.contains('side-nav') ||
                node.classList.contains('back-to-top'))) return;

            if (!inserted) {
                document.body.insertBefore(shell, node);
                inserted = true;
            }
            shell.appendChild(node); /* moving nodes keeps their listeners */
        });

        if (!inserted) return;

        /* Opaque shell matching the page's own background (white fallback) */
        var bg = getComputedStyle(document.body).backgroundColor;
        shell.style.backgroundColor = (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')
            ? '#fff' : bg;

        document.body.classList.add('has-shell');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    /* ===== Back-to-top button (rAF-throttled scroll listener) ========= */
    var btt = document.createElement('button');
    btt.className = 'back-to-top';
    btt.setAttribute('aria-label', 'Back to top');
    btt.innerHTML = '<i class="fas fa-arrow-up"></i>';
    document.body.appendChild(btt);

    var ticking = false;
    window.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
            btt.classList.toggle('visible', window.scrollY > 500);
            ticking = false;
        });
    }, { passive: true });

    btt.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });
})();
