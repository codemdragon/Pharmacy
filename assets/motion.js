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
        '.intro',                        /* sub-page intro (text + image) */
        '.health-block',                 /* alternating category blocks */
        '.info-box',                     /* grey info sections */
        '.local-card',                   /* who we are */
        '.visit-card',                   /* vaccinations visit-us card */
        '.form-card',                    /* contact form */
        '.contact-wrapper .info-card',   /* contact store info */
        '.location-wrapper',             /* where are we map + hours */
        '.quality-content',              /* home quality section */
        '.subscription-content',         /* home subscription section */
        '.section > h2'                  /* section headings */
    ];

    function tag(el, delay) {
        el.classList.add('mr');
        if (delay) el.setAttribute('data-mr-delay', delay);
    }

    function init() {
        /* Tag staggered grid children */
        GROUPS.forEach(function (sel) {
            document.querySelectorAll(sel).forEach(function (group) {
                Array.prototype.forEach.call(group.children, function (child, i) {
                    tag(child, Math.min(i * 0.06, 0.3));
                });
            });
        });

        /* Tag standalone blocks */
        ITEMS.forEach(function (sel) {
            document.querySelectorAll(sel).forEach(function (el) {
                if (!el.classList.contains('mr')) tag(el);
            });
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
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
