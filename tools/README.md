# Site Search

The header search box searches every page of the website using a
pre-built index: `assets/search-index.json`.

- Typing in any header search box shows a live dropdown of quick
  results (Pages / Subheadings / In the content).
- Pressing Enter or the search button opens `search.html?q=...` with the
  full results, separated into **Main titles**, **Subheadings** and
  **Content on the pages**.

## Rebuilding the index

The index is generated from the static HTML pages. Rebuild it whenever
pages are added/removed or their headings/text change significantly:

```
node tools/build-search-index.js
```

Requires Node.js. Commit the regenerated `assets/search-index.json`
together with the page changes.

## Files

| File | Purpose |
| ---- | ------- |
| `tools/build-search-index.js` | Index builder (titles, breadcrumbs, subheadings, content) |
| `assets/search-index.json` | Generated index (do not edit by hand) |
| `assets/search.js` | Search engine: dropdown + results page rendering (injected sitewide by `loader.js`) |
| `search.html` | Full search results page |
