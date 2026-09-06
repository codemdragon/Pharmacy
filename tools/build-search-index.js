#!/usr/bin/env node
/* ==========================================================================
   Search index builder
   --------------------------------------------------------------------------
   Scans every public HTML page of the site and extracts:
     - the main title (first <h1>, fallback <title>)
     - the breadcrumb trail (derived from the folder structure)
     - subheadings (<h2>/<h3>/<h4>) with the content that belongs to them
     - an intro paragraph and the full page text

   Output: assets/search-index.json  (consumed by assets/search.js)

   Usage:  node tools/build-search-index.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'search-index.json');

/* Pages / folders that must never be indexed */
const SKIP_FILES = new Set(['admin.html', 'search.html']);
const SKIP_DIRS = new Set([
    'components', 'assets', 'tools', '.git', 'node_modules',
    '.cache', 'dist', 'build', 'coverage'
]);

/* Human labels for the breadcrumb trail */
const SECTION_LABELS = {
    myhealth: 'My Health',
    services: 'Pharmacy Services',
    wellness: 'Wellness',
    seasonal: 'Seasonal',
    chronic_conditions: 'Chronic Conditions',
    general_health: 'General Health',
    prescriptions: 'Prescriptions',
    vaccinations: 'Vaccinations',
    assessments: 'Assessments & Monitoring',
    medication_customization: 'Medication Customization',
    wellness_consultation: 'Wellness Consultations'
};

const ROOT_PAGE_LABELS = {
    index: 'Home',
    who_we_are: 'Who We Are',
    where_are_we: 'Where Are We',
    contact_us: 'Contact Us'
};

/* ------------------------------------------------------------------ utils */

function findHtmlFiles(dir, out) {
    out = out || [];
    for (const name of fs.readdirSync(dir).sort()) {
        if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
            findHtmlFiles(full, out);
        } else if (/\.html?$/i.test(name) && !SKIP_FILES.has(name.toLowerCase())) {
            out.push(full);
        }
    }
    return out;
}

const ENTITIES = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&#39;': "'", '&#039;': "'", '&apos;': "'",
    '&rsquo;': '\u2019', '&lsquo;': '\u2018', '&rdquo;': '\u201D', '&ldquo;': '\u201C',
    '&ndash;': '\u2013', '&mdash;': '\u2014', '&hellip;': '\u2026',
    '&eacute;': '\u00E9', '&egrave;': '\u00E8', '&ecirc;': '\u00EA',
    '&agrave;': '\u00E0', '&ccedil;': '\u00E7', '&ocirc;': '\u00F4'
};

function decodeEntities(text) {
    return text
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeFromCode(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => safeFromCode(parseInt(d, 10)))
        .replace(/&[a-z]+;/gi, (m) => ENTITIES[m] !== undefined ? ENTITIES[m] : ' ');
}

function safeFromCode(code) {
    try { return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' '; }
    catch (e) { return ' '; }
}

function cleanText(html) {
    return decodeEntities(String(html).replace(/<[^>]*>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
}

function fold(s) {
    return String(s || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/* Strip <script>/<style>/<noscript>/comments, keep the rest of <body>. */
function extractBody(html) {
    const m = html.match(/<body[^>]*>([\s\S]*)<\/body\s*>/i);
    let body = m ? m[1] : html;
    return body
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
        .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
        .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, ' ');
}

/* Ordered stream of the text blocks we care about. */
const BLOCK_RE = /<(h1|h2|h3|h4|p|li)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;

function extractBlocks(bodyHtml) {
    const blocks = [];
    let m;
    BLOCK_RE.lastIndex = 0;
    while ((m = BLOCK_RE.exec(bodyHtml)) !== null) {
        const tag = m[1].toLowerCase();
        const attrs = m[2] || '';
        const cls = (attrs.match(/class\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
        if (/disclaimer|carousel|sr-only/i.test(cls)) continue;
        const text = cleanText(m[3]);
        if (!text) continue;
        blocks.push({ tag: tag, text: text });
    }
    return blocks;
}

function extractTitleTag(html) {
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title\s*>/i);
    if (!m) return '';
    let t = cleanText(m[1]);
    /* drop site-name suffixes such as " | Guardian, I.D.A. & Remedy'sRx" */
    t = t.split(/\s*[|\u2013\u2014]\s*/)[0].trim();
    return t;
}

function crumbFor(relUrl) {
    const parts = relUrl.split('/');
    const file = parts[parts.length - 1].replace(/\.html?$/i, '');
    if (parts.length === 1) {
        return [ROOT_PAGE_LABELS[file.toLowerCase()] || prettify(file)];
    }
    return parts.slice(0, -1).map((seg) =>
        SECTION_LABELS[seg.toLowerCase()] || prettify(seg));
}

function prettify(slug) {
    return slug.replace(/[_-]+/g, ' ').trim()
        .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

/* ------------------------------------------------------------- page parse */

function parsePage(absPath) {
    const relUrl = path.relative(ROOT, absPath).split(path.sep).join('/');
    const html = fs.readFileSync(absPath, 'utf8');
    const body = extractBody(html);
    const blocks = extractBlocks(body);

    let title = '';
    const sections = [];
    const introParts = [];
    let current = null;      /* section currently collecting paragraphs */
    let currentH2 = null;

    for (const b of blocks) {
        if (b.tag === 'h1') {
            if (!title) title = b.text;
            continue;
        }
        if (b.tag === 'h2' || b.tag === 'h3' || b.tag === 'h4') {
            const lvl = Number(b.tag.charAt(1));
            if (lvl === 2) currentH2 = b.text;
            current = {
                h: b.text,
                lvl: lvl,
                parent: lvl > 2 ? currentH2 : null,
                parts: []
            };
            sections.push(current);
            continue;
        }
        /* p / li: content belongs to the nearest open subheading */
        if (current) current.parts.push(b.text);
        else introParts.push(b.text);
    }

    if (!title) title = extractTitleTag(html);
    if (!title) title = prettify(relUrl.split('/').pop().replace(/\.html?$/i, ''));

    /* Intro paragraphs (before any subheading) become an unlabelled section
       so their text can produce content matches and snippets too. */
    if (introParts.length) {
        sections.unshift({
            h: '', lvl: 0, parent: null,
            parts: introParts.slice()
        });
    }

    const titleFolded = fold(title);

    /* A subheading identical to the page title (banner repeat) is demoted
       to an unlabelled section so it does not duplicate the page result. */
    const outSections = sections
        .map((s) => {
            const labelled = s.h && fold(s.h) !== titleFolded;
            const text = s.parts.join(' ').replace(/\s+/g, ' ').trim();
            return {
                h: labelled ? s.h : '',
                lvl: s.lvl,
                parent: labelled && s.lvl > 2 ? s.parent : null,
                text: text.slice(0, 1200)
            };
        })
        .filter((s) => s.h || s.text);

    const intro =
        introParts.find((p) => p.length >= 40) ||
        introParts[0] ||
        (outSections[0] && !outSections[0].h ? outSections[0].text.slice(0, 220) : '') ||
        '';

    const fullText = [title]
        .concat(introParts)
        .concat(outSections.map((s) => (s.h ? s.h + ' ' : '') + s.text))
        .join(' ')
        .replace(/\s+/g, ' ')
        .slice(0, 25000);

    return {
        url: relUrl,
        title: title,
        crumb: crumbFor(relUrl),
        intro: intro.slice(0, 300),
        sections: outSections,
        text: fullText
    };
}

/* ------------------------------------------------------------------- main */

function main() {
    const files = findHtmlFiles(ROOT);
    const pages = files.map(parsePage)
        .sort((a, b) => a.url.localeCompare(b.url));

    const index = {
        generated: new Date().toISOString(),
        pageCount: pages.length,
        pages: pages
    };

    fs.writeFileSync(OUT, JSON.stringify(index));

    const size = (fs.statSync(OUT).size / 1024).toFixed(1);
    console.log('Indexed ' + pages.length + ' pages -> ' +
        path.relative(ROOT, OUT) + ' (' + size + ' kB)');
    pages.forEach((p) => {
        console.log('  - ' + p.url + '  "' + p.title + '"  (' +
            p.sections.filter((s) => s.h).length + ' subheadings)');
    });
}

main();
