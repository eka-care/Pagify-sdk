# Server-side rendering with Pagify

Generate the **same paginated document** the browser SDK renders, on a server, and print it with
Puppeteer (or any headless Chromium), for prescriptions, bills and charts.

- [How it fits together](#how-it-fits-together)
- [Install](#install)
- [Quick start (Node + Puppeteer)](#quick-start-node--puppeteer)
- [Loading Paged.js: browser vs server](#loading-pagedjs-browser-vs-server)
- [The "rendering complete" event: browser vs server](#the-rendering-complete-event-browser-vs-server)
- [The row check](#the-row-check)
- [Options](#options)
- [Production notes](#production-notes)
- [Troubleshooting](#troubleshooting)
- [Moving an existing renderer onto Pagify](#moving-an-existing-renderer-onto-pagify)

## How it fits together

The paginated HTML document is built in **one** place: [`pagify-utils/`](../pagify-utils/index.js),
plain CommonJS with no dependencies. Both renderers use it, so a pagination fix lands everywhere at once.

| | Browser | Server |
|---|---|---|
| Entry point | `pagify.render(options)` | `buildIframeHTML(options)` from `@eka-care/pagify-sdk/pagify-utils` |
| Where the document runs | a hidden (or visible) iframe Pagify creates | a page you open in headless Chromium |
| Paged.js | loaded from a URL (unpkg) | inlined from the copy shipped with the package |
| PDF made by | html2pdf.js, inside the iframe | your `page.pdf()` call |
| "Rendering complete" | callbacks + window events | a global function you expose with `page.exposeFunction` |

`buildIframeHTML` takes the same options as `pagify.render()` (page size, margins, header/footer HTML,
`stableTablePagination`, …) plus three server-side options described below. With those three unset, it
returns exactly the document `pagify.render()` mounts.

## Install

Nothing beyond the SDK itself is pulled in (it has no dependencies):

```bash
npm install @eka-care/pagify-sdk@^1.5.0
```

Before 1.5.0 is on npm, install it from GitHub instead, pinned to a tag or commit (not a branch) so a
renderer only changes when you bump it: `npm install github:eka-care/Pagify-sdk#<tag-or-commit>`.

```js
const { buildIframeHTML, PAGEDJS_POLYFILL_PATH } = require("@eka-care/pagify-sdk/pagify-utils");
// or: import { buildIframeHTML, PAGEDJS_POLYFILL_PATH } from "@eka-care/pagify-sdk/pagify-utils";
```

Types ship with it (`pagify-utils/index.d.ts`), and the subpath resolves under TypeScript
`moduleResolution: "node"` as well as `node16`/`bundler`.

## Quick start (Node + Puppeteer)

```js
const fs = require("fs");
const puppeteer = require("puppeteer");
const { buildIframeHTML, PAGEDJS_POLYFILL_PATH } = require("@eka-care/pagify-sdk/pagify-utils");

// Read once at start-up: Eka's Paged.js fork, shipped with the package.
const PAGED_JS = fs.readFileSync(PAGEDJS_POLYFILL_PATH, "utf8");

async function renderPdf(browser, input, { timeoutMs = 30000 } = {}) {
  const html = buildIframeHTML({
    body_html: input.body_html,
    header_html: input.header_html,
    footer_html: input.footer_html,
    head_html: input.head_html,
    page_size: input.page_size || "A4",
    margin_left: input.margin_left || "0mm",
    margin_right: input.margin_right || "0mm",
    header_height: input.header_height || "0mm",
    footer_height: input.footer_height || "0mm",
    page_number_selector: input.page_number_selector || "",

    isViewOnlySkipMakingPDF: true,          // Puppeteer makes the PDF; skip the in-page html2pdf step
    pagedjs_inline: PAGED_JS,               // no network needed
    completionCallbackName: "onPagifyRendered",
    stableTablePagination: true,            // the fork's table fixes + the row check
  });

  const page = await browser.newPage();
  try {
    // 1. Expose the completion callback BEFORE loading the document.
    const rendered = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Pagination timed out")), timeoutMs);
      page.exposeFunction("onPagifyRendered", (payload) => {
        clearTimeout(timer);
        resolve(payload);
      }).catch(reject);
    });

    // 2. Load the document; pagination starts once its fonts are ready.
    await page.setContent(html);

    // 3. Wait for pagination, then print.
    const { total, validation } = await rendered;
    if (validation && !validation.ok) {
      console.error("Pagination lost or cut rows", validation); // report it; see below
    }
    const pdf = await page.pdf({ format: input.page_size || "A4", printBackground: true });
    return { pdf, pages: total, validation };
  } finally {
    await page.close();
  }
}

// const browser = await puppeteer.launch();
// const { pdf } = await renderPdf(browser, { body_html: "<h1>Hello</h1>" });
```

## Loading Paged.js: browser vs server

The document needs Paged.js, the library that splits it into pages. How it gets loaded is the main
difference between the two renderers.

| | Browser (`pagify.render`) | Server (`buildIframeHTML`) |
|---|---|---|
| Default | `<script src>` from unpkg: the package's fork with `stableTablePagination`, else stock `pagedjs@0.4.3` | same default, but you should inline it |
| Recommended | default | `pagedjs_inline: fs.readFileSync(PAGEDJS_POLYFILL_PATH, "utf8")` with `stableTablePagination: true` |
| Why | the browser can fetch and cache it | a Lambda/worker may have no network, and a fetch adds latency and a failure point per render |

- **`pagedjs_url`** — a URL for the `<script src>`. Accepted by both `pagify.render()` and
  `buildIframeHTML`.
- **`pagedjs_inline`** — the Paged.js source itself, placed in an inline `<script>`. Takes precedence
  over `pagedjs_url`. Read it **once** at start-up, not per render (it's about 900 KB).
- **`PAGEDJS_POLYFILL_PATH`** — absolute path to the Paged.js build shipped in the package:
  [Eka's fork](https://github.com/eka-care/pagedjs) of 0.4.3 (`PAGEDJS_FORK_VERSION`, currently
  `0.4.3-eka.1`), the same file the browser loads with `stableTablePagination`. Pair it with
  `stableTablePagination: true`: that also drops the legacy header handler, which the fork doesn't
  need. It is `null` in a browser bundle.

## The "rendering complete" event: browser vs server

Pagination is asynchronous (fonts load, then Paged.js lays out page by page), so both renderers tell
you when it has finished. **Only print after this event.** Printing on `load` or `networkidle` can
capture a half-paginated document.

### Browser

```js
await pagify.render({
  body_html,
  isViewOnlySkipMakingPDF: true,              // preview only; omit to also get a PDF
  stableTablePagination: true,
  callback: () => {},                          // pagination finished (no arguments)
  onPaginationValidation: (validation) => {},  // the row check, when stableTablePagination is on
  onPreviewReady: ({ success, error }) => {},  // preview mode: the iframe is ready
  onPdfReady: (blobUrl) => {},                 // PDF mode: the PDF blob URL
  onPdfError: (error) => {},
});
```

The same moments are also dispatched on `window` as `paginationValidation`, `previewReady` /
`previewError` and `pdfReady` / `pdfError` events.

### Server

Name a global function with `completionCallbackName`. The document calls it once pagination has
finished, with:

```ts
{ total: number;               // pages
  validation: {                // the row check (null unless stableTablePagination is on)
    source: number; printed: number;
    missing: number[]; clipped: number[];   // row numbers, 1 = first body row
    ok: boolean;
  } | null }
```

With Puppeteer, `page.exposeFunction(name, fn)` creates that global. Register it **before**
`page.setContent(html)`. If the function isn't there yet when pagination ends, the document retries
every 100 ms for up to 30 s, then gives up, so a missing or misspelt name shows up as your timeout.

The callback fires only on success. If Paged.js throws, it never fires; rely on your timeout, as in the
quick start.

## The row check

Stock Paged.js can silently leave table rows off the printed page: they stay in the DOM but sit in a
hidden overflow area. The fork fixes that, and is tested against it across 84 page setups per test
document. The row check is the production monitor for documents its suite never saw: with
`stableTablePagination: true`, Pagify checks after pagination that every `<tbody>` row (outside the
running header/footer) is **visible** on some page. The result arrives as `validation` in the
completion payload:

| Field | Meaning |
|---|---|
| `source` | body rows in your HTML |
| `printed` | rows visible on some page |
| `missing` | numbers of rows not visible anywhere (1 = first body row, in document order) |
| `clipped` | numbers of rows partly cut off at a page edge |
| `ok` | `true` when nothing is missing or clipped |

Rows are reported by number, never by their text (which may be patient data), so the payload is safe
to log. `ok: false` means the PDF is incomplete. Log it with the request id and alert on it. Whether to
also fail the render is your call; Pagify reports and doesn't block.

## Options

Everything `pagify.render()` accepts for the document, plus the server options:

| Option | Default | Notes |
|---|---|---|
| `body_html` | `""` | The document body. Decode it first if your API receives it encoded. |
| `header_html` / `footer_html` | `""` | Repeated on every page (running header/footer). |
| `head_html` | `""` | Extra `<head>` content: your `<style>`, fonts, `@page` overrides. |
| `page_size` | `"A4"` | Any CSS `@page` size (`A4`, `A5`, `letter`, `210mm 297mm`, …). |
| `margin_left` / `margin_right` | `"0mm"` | Page margins. |
| `header_height` / `footer_height` | `"0mm"` | Space reserved for the header/footer (the top/bottom page margins). |
| `page_number_selector` | `""` | Elements matching it get "Page N of M". |
| `footer_only_on_last_page` | `false` | Footer on the last page only. |
| `page_padding_top` | `"16px"` | Padding at the top of each page's content. |
| `stableTablePagination` | `false` | Paginate with Eka's Paged.js fork (no lost table rows) + the row check. Recommended. |
| `isViewOnlySkipMakingPDF` | `false` | **Set `true` on the server**: skips the in-page html2pdf step, which would fetch html2pdf.js from unpkg. |
| `pagedjs_inline` | `null` | **Server:** Paged.js source to inline. |
| `pagedjs_url` | unpkg: the fork with `stableTablePagination`, else stock `pagedjs@0.4.3` | Where to load Paged.js from when not inlined. |
| `completionCallbackName` | `null` | **Server:** global function called with `{ total, validation }`. |

## Production notes

- **Match the PDF size to the page size.** Pass the same size to `page.pdf({ format })`, or use
  `preferCSSPageSize: true` so the PDF follows the document's `@page` size (needed for custom sizes).
- **Fonts.** Pagination waits for `document.fonts.ready`, so fonts referenced in `head_html` must be
  reachable from the renderer, or installed in the image. A font that arrives after pagination changes
  line heights and breaks the layout.
- **No network.** With `pagedjs_inline` and `isViewOnlySkipMakingPDF: true`, the document makes no
  requests of its own. Images or fonts in your HTML still do.
- **One page per render.** Open a fresh page per document and close it in `finally`; reuse the
  browser.
- **Timeouts.** Pagination of a typical prescription takes well under a second; budget for the largest
  documents you print (30 s is a safe default).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| The completion callback never fires | `exposeFunction` registered after `setContent`; the name doesn't match `completionCallbackName`; or Paged.js failed to load (check the page console). |
| Console errors about `html2pdf` / requests to unpkg | `isViewOnlySkipMakingPDF` isn't `true`. |
| Pages are blank or unstyled | Paged.js didn't load: inline it with `pagedjs_inline`. |
| `validation.ok === false` | Rows were lost or cut. Make sure `stableTablePagination` is on, and report the payload with the HTML. |
| Text reflows between environments | Different fonts installed; pin fonts in the image or load them in `head_html`. |
| PDF page size differs from the layout | `page.pdf` `format` doesn't match `page_size`; use the same value or `preferCSSPageSize: true`. |

## Moving an existing renderer onto Pagify

If you assemble the HTML yourself today (a vendored template, a copied Paged.js, your own
table-header handler), replace that with one `buildIframeHTML` call:

1. Map your request fields to the options above. For example, a `head` field becomes `head_html`.
   Decoding the request (e.g. `decodeURI`) stays in your code.
2. Set `isViewOnlySkipMakingPDF: true`, `pagedjs_inline` from `PAGEDJS_POLYFILL_PATH`,
   `completionCallbackName` matching your `exposeFunction` name, and `stableTablePagination: true`.
3. Delete the vendored template, Paged.js copy and handlers, **including any table-header or
   `<colgroup>` repeat handler**: the fork repeats both itself, while the page is measured.
4. Before switching traffic, render a sample of real requests both ways and compare. Pagify's base
   stylesheet may differ slightly from a hand-built one (for example `table { width: 100% }`,
   `img { max-width: 100% }`), and it starts pagination only after fonts load.
