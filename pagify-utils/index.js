/**
 * pagify-utils — the single source of the HTML document Pagify paginates.
 *
 * Plain CommonJS with zero dependencies, so it runs anywhere:
 * - in the browser, bundled into the Pagify SDK (`pagify.render()` uses it for its iframe);
 * - in Node, e.g. a Puppeteer worker that makes the PDF server-side:
 *
 *     const { buildIframeHTML, PAGEDJS_POLYFILL_PATH } = require("@eka-care/pagify-sdk/pagify-utils");
 *     const html = buildIframeHTML({
 *         body_html,
 *         isViewOnlySkipMakingPDF: true,            // Puppeteer makes the PDF, not html2pdf
 *         pagedjs_inline: fs.readFileSync(PAGEDJS_POLYFILL_PATH, "utf8"),
 *         completionCallbackName: "onCustomEvent",  // page.exposeFunction("onCustomEvent", ...)
 *         stableTablePagination: true,
 *     });
 *
 * Fix pagination here once; every renderer picks it up.
 */

/** Paged.js the browser SDK loads by default (keep in sync with the vendored ./paged.polyfill.js). */
const DEFAULT_PAGEDJS_URL = "https://unpkg.com/pagedjs@0.4.3/dist/paged.polyfill.js";

/**
 * Absolute path of the vendored Paged.js 0.4.3 polyfill shipped with this folder (Node only; null in
 * the browser). Read it and pass it as `pagedjs_inline` to render without network access.
 */
const PAGEDJS_POLYFILL_PATH = typeof __dirname !== "undefined" ? __dirname + "/paged.polyfill.js" : null;

/** CSS that prints "Page N of M" before `page_number_selector` (same string render() always used). */
function buildPageNumberCSS(page_number_selector) {
    return page_number_selector
                ? `${page_number_selector}::before {
                    content: "Page " counter(page) " of " counter(pages) " ";
                }`
                : "";
}

/** The <script> that loads Paged.js and then starts pagination. */
function pagedJsScriptTag(pagedjs_url, pagedjs_inline) {
    if (pagedjs_inline) {
        // Inline source: neutralise any "</script" inside it so it can't close the tag early.
        const source = String(pagedjs_inline).replace(/<\/script/gi, "<\\/script");
        return `<script>${source}<\/script>
                    <script>initializePagination()<\/script>`;
    }
    const src = String(pagedjs_url || DEFAULT_PAGEDJS_URL).replace(/"/g, "&quot;");
    return `<script src="${src}" onload="initializePagination()"><\/script>`;
}

/**
 * String builders for the paginated document. Static methods; `this` is the class.
 * Template content is whitespace-sensitive: the browser SDK's output must not change.
 */
class PagifyTemplates {
    /**
     * Build HTML content for the iframe
     */
    static buildIframeHTML({
        instanceId,
        body_html,
        header_html,
        footer_html,
        head_html,
        page_size,
        margin_left,
        margin_right,
        header_height,
        footer_height,
        footer_only_on_last_page,
        page_padding_top,
        pageNumberCSS,
        isViewOnlySkipMakingPDF,
        beautifyListItems,
        stableTablePagination = false,
        pagedjs_url = DEFAULT_PAGEDJS_URL,
        pagedjs_inline = null,
        completionCallbackName = null,
    }) {
        return `
            <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <script>
                        // Configure Paged.js
                        window.PagedConfig = {
                            auto: false,
                        }
                    <\/script>
                    <script>
                        let totalPages;
                        let isViewOnly = ${isViewOnlySkipMakingPDF};
                        
                        ${!isViewOnlySkipMakingPDF ? `${this.getPdfGenerationScript(instanceId, beautifyListItems, page_size)}` : ''}
                        function initializePagination() {
                            ${this.getPagedJSInitScript(instanceId, isViewOnlySkipMakingPDF, stableTablePagination, completionCallbackName)}
                        }
                    <\/script>
                    ${pagedJsScriptTag(pagedjs_url, pagedjs_inline)}
                    <style>
                        /* Ensure print colors are preserved */
                        body {
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                            margin: 0;
                            padding: 0;
                        }

                        /* Page numbering styles */
                        ${pageNumberCSS}

                        /* Header and footer positioning */
                        .header {
                            position: running(header);
                        }
                        
                        .footer {
                            position: running(footer);
                        }
                        
                        /* Paged.js content styling */
                        .pagedjs_page_content {
                            border-bottom-width: 1px;
                            border-top-width: 1px;
                            --tw-border-opacity: 1;
                            border-color: rgba(218, 222, 227, var(--tw-border-opacity));
                            padding-top: ${page_padding_top};
                        }
                        
                        .pagedjs_pages {
                            align-items: center;
                            display: flex;
                            flex: 1;
                            flex-direction: column;
                        }
                        
                        /* Prevent table rows from breaking across pages */
                        ${stableTablePagination ? "tr[data-pagify-keep-whole]" : "tr"} {
                            break-inside: avoid;
                        }${stableTablePagination ? `

                        /* stableTablePagination: hide the edges inside a flattened rowspan group / cut row.
                           Colour, not border-style: the border keeps its width, so re-showing it at a
                           page edge after layout can't make a row taller than Paged.js measured. */
                        [data-pagify-hide-top] {
                            border-top-color: transparent !important;
                        }

                        [data-pagify-hide-bottom] {
                            border-bottom-color: transparent !important;
                        }

                        /* stableTablePagination: no padding on the inner edges of a row cut into sub-rows */
                        [data-pagify-cont-top] {
                            padding-top: 0 !important;
                        }

                        [data-pagify-cont-bottom] {
                            padding-bottom: 0 !important;
                        }` : ""}
                        
                        /* Page layout configuration */
                        @page {
                            margin-left: ${margin_left};
                            margin-right: ${margin_right};
                            margin-top: ${header_height};
                            margin-bottom: ${footer_height};
                            size: ${page_size};
                        
                            @bottom-center {
                                content: element(footer);
                            }
                        
                            @top-center {
                                content: element(header);
                            }
                        }

                        /* Base64 image optimization */
                        img {
                            max-width: 100%;
                            height: auto;
                        }

                        /* Print-friendly table styles */
                        table {
                            border-collapse: collapse;
                            width: 100%;
                        }

                        /* Page break controls */
                        .page-break-before {
                            page-break-before: always;
                        }

                        .page-break-after {
                            page-break-after: always;
                        }

                        .page-break-inside-avoid {
                            page-break-inside: avoid;
                        }
                    </style>
                    ${head_html}
                </head>
                <body>
                    <!-- Header content (appears on every page) -->
                    <div class="header" style="width: 100%">
                        ${header_html}
                    </div>
                    
                    <!-- Footer content (conditional positioning) -->
                    ${footer_only_on_last_page ? "" : `<div class="footer" style="width: 100%">
                        ${footer_html}
                    </div>`}
                    
                    <!-- Main body content -->
                    ${body_html}

                    <!-- Footer on last page only (if specified) -->
                    ${footer_only_on_last_page ? `<div class="footer" style="width: 100%">
                        ${footer_html}
                    </div>` : ""}
                </body>
            </html>
        `;
    }

    /**
     * Get Paged.js initialization script
     */
    static getPagedJSInitScript(instanceId, isViewOnlySkipMakingPDF, stableTablePagination = false, completionCallbackName = null) {
        return `
            // Wait for fonts to load before starting pagination
            document.fonts.ready.then(async () => {
                console.log("Fonts are ready");
                try {
                    // Import Paged.js dynamically
                    const { Previewer, Handler, registerHandlers } = window.Paged;

${stableTablePagination ? this.getStableTablePaginationScript() : this.getLegacyTableHandlerScript()}
                    
                    console.log('Paged.js imported successfully');
                    
                    // Initialize pagination
                    const previewer = new Previewer();
                    const result = await previewer.preview();
                    
                    console.log('Paged.js pagination complete:', result);
                    totalPages = result.total;${stableTablePagination ? `

                    // Prove no body row was lost, then report it to the host page.
                    window.parent.postMessage({
                        type: "PAGINATION_VALIDATION",
                        result: pagifyValidateRows(),
                        iter: "${instanceId}"
                    }, "*");` : ""}${completionCallbackName ? `

                    // Tell a headless driver (e.g. Puppeteer's page.exposeFunction) pagination is done.
                    // Retries briefly in case the function is bound after the page starts.
                    (function pagifyNotifyComplete(attempt) {
                        var notify = window[${JSON.stringify(String(completionCallbackName)).replace(/</g, "\\u003c")}];
                        if (typeof notify === "function") {
                            notify({ total: result.total, validation: window.__pagifyRowValidation || null });
                        } else if (attempt < 300) {
                            setTimeout(function () { pagifyNotifyComplete(attempt + 1); }, 100);
                        }
                    })(0);` : ""}
                    
                    // Notify parent window that rendering is complete
                    window.parent.postMessage({
                        type: "renderpdf", 
                        iter: "${instanceId}"
                    }, "*");

                    if (${isViewOnlySkipMakingPDF}) {
                        window.parent.postMessage({ 
                            type: "PREVIEW_READY",
                            iter: "${instanceId}"
                        }, "*");
                    } else {
                        // PDF generation mode
                        if (typeof generatePdfBlob === "function") { 
                            generatePdfBlob(); 
                        }
                    }
                    
                } catch (error) {
                    console.error('Failed to load or initialize Paged.js:', error);
                    
                if (${isViewOnlySkipMakingPDF}) {
                    window.parent.postMessage({ 
                            type: "PREVIEW_ERROR",
                            error: "Failed to initialize Paged.js: " + error.message,
                            iter: "${instanceId}"
                        }, "*");
                    } else {
                        window.parent.postMessage({
                            type: "PDF_ERROR",
                            error: "Failed to initialize Paged.js: " + error.message,
                            iter: "${instanceId}"
                        }, "*");
                    }
                }
            });
        `;
    }

    /**
     * Stable table pagination handler (`stableTablePagination: true`). Runs inside the iframe.
     *
     * Fixes, each a way the legacy handler loses or garbles table rows:
     * 1. Header (and <colgroup>) repeat happens in `renderNode` — BEFORE Paged.js measures the page. The legacy
     *    `afterPageLayout` insert makes each continued page taller than measured, pushing its
     *    last row into Paged.js's hidden overflow column (the row silently doesn't print).
     * 2. `break-inside: avoid` only on rows that fit on a page (`data-pagify-keep-whole`). A row
     *    taller than a page can't be kept whole: Paged.js loops ("Layout repeated"), gives up,
     *    and drops every row after it. Nor can Paged.js reliably split one <tr> (part of it lands
     *    in the hidden overflow column). So oversized rows are cut, before pagination, into
     *    sub-rows of ~1/3 page at block boundaries, which are then kept whole.
     * 3. rowspan groups are flattened into one cell per row before pagination (borders hidden so
     *    they still read as one cell), then closed/re-labelled at each page edge. Edges are hidden
     *    by colour (not border-style) and labels are set in renderNode, so nothing reflows a page
     *    after Paged.js has measured it — a 1px reflow pushes a kept-whole row off the page. Paged.js only
     *    carries a rowspan cell across a break between rows, and miscounts it otherwise.
     * 4. No `height: max-content` on page content — it hid overflow by drawing it over the footer.
     * 5. `pagifyValidateRows()` proves every body row is visible on some page (geometry, not DOM
     *    presence — a row can be in the DOM yet sit in the hidden overflow column).
     *
     * Only rows in `tbody`, outside the running `.header` / `.footer`, are touched.
     * Must stay template-literal safe: no backticks, no "dollar-brace", escape backslashes.
     */
    static getStableTablePaginationScript() {
        return `
                    var PAGIFY_ROW = "data-pagify-row";
                    var PAGIFY_KEEP = "data-pagify-keep-whole";
                    var pagifySourceRows = [];
                    var pagifySpanLabels = [];

                    // Body rows we own: tbody rows outside the running header/footer.
                    function pagifyBodyRows(root) {
                        return Array.from(root.querySelectorAll("tbody > tr")).filter(function (tr) {
                            return !tr.closest(".header, .footer");
                        });
                    }

                    function pagifyRowLabel(tr) {
                        return (tr.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 80);
                    }

                    // Measure rows at the real page content size: tag the ones that fit as keep-whole,
                    // cut taller ones into sub-rows that fit. Paged.js has already applied the @page rules (its --pagedjs-*
                    // vars) by beforeParsed, so this follows page_size / margins / head_html.
                    function pagifyTagKeepWholeRows(content, rows) {
                        var body = document.body;
                        var box = document.createElement("div");
                        box.style.cssText = "position:absolute;left:-100000px;top:0;visibility:hidden;" +
                            "width:calc(var(--pagedjs-pagebox-width) - var(--pagedjs-margin-left) - var(--pagedjs-margin-right))";
                        var probe = document.createElement("div");
                        probe.style.cssText = "position:absolute;visibility:hidden;" +
                            "height:calc(var(--pagedjs-pagebox-height) - var(--pagedjs-margin-top) - var(--pagedjs-margin-bottom))";
                        var padProbe = document.createElement("div");
                        padProbe.className = "pagedjs_page_content";
                        padProbe.style.cssText = "position:absolute;visibility:hidden;height:0";
                        body.appendChild(probe);
                        body.appendChild(padProbe);
                        body.appendChild(box);
                        try {
                            var pageHeight = probe.getBoundingClientRect().height;
                            var padTop = parseFloat(window.getComputedStyle(padProbe).paddingTop) || 0;
                            while (content.firstChild) box.appendChild(content.firstChild);
                            if (!(pageHeight > 0) || !(box.getBoundingClientRect().width > 0)) {
                                console.warn("Pagify: could not measure the page; keeping all rows whole (legacy behaviour).");
                                rows.forEach(function (tr) { tr.setAttribute(PAGIFY_KEEP, ""); });
                                return;
                            }
                            var unsplittable = 0;
                            rows.forEach(function (tr) {
                                var thead = tr.closest("table").querySelector(":scope > thead");
                                var room = pageHeight - padTop - (thead ? thead.getBoundingClientRect().height : 0) - 4;
                                if (tr.getBoundingClientRect().height <= room) {
                                    tr.setAttribute(PAGIFY_KEEP, "");
                                    return;
                                }
                                // Taller than a page: Paged.js can't split a <tr> reliably (part of it
                                // lands in the hidden overflow column), so cut it into sub-rows that each
                                // fit, and keep those whole.
                                var parts = pagifySplitRow(tr, room / 3);
                                var allFit = parts && parts.every(function (row) {
                                    return row.getBoundingClientRect().height <= room;
                                });
                                if (allFit) parts.forEach(function (row) { row.setAttribute(PAGIFY_KEEP, ""); });
                                else unsplittable++;
                            });
                            if (unsplittable) console.warn("Pagify: " + unsplittable + " table row(s) taller than a page could not be cut at a block boundary; Paged.js will split them.");
                        } finally {
                            while (box.firstChild) content.appendChild(box.firstChild);
                            box.remove();
                            probe.remove();
                            padProbe.remove();
                        }
                    }

                    // Split a parent's children into units: each block-level element on its own,
                    // runs of inline / text nodes grouped (never cut inside a line of text).
                    function pagifyUnits(parent) {
                        var units = [];
                        var run = [];
                        Array.from(parent.childNodes).forEach(function (n) {
                            var display = n.nodeType === 1 ? window.getComputedStyle(n).display : "inline";
                            var isBlock = display !== "inline" && display !== "inline-block" && display !== "contents";
                            if (n.nodeType === 1 && isBlock) {
                                if (run.length) units.push(run);
                                run = [];
                                units.push([n]);
                            } else {
                                run.push(n);
                            }
                        });
                        if (run.length) units.push(run);
                        return units;
                    }

                    function pagifyUnitHeight(nodes) {
                        var range = document.createRange();
                        range.setStartBefore(nodes[0]);
                        range.setEndAfter(nodes[nodes.length - 1]);
                        return range.getBoundingClientRect().height;
                    }

                    // Plan (measure only, no DOM changes) how to cut a parent's content into chunks of
                    // at most ~target px. An element taller than target is cut inside, its parts
                    // wrapped in shallow clones of it. Returns null if something atomic is too tall.
                    function pagifyPlanChunks(parent, target) {
                        // Whitespace-only text runs are never a chunk of their own (they would become
                        // an empty sub-row); they are left out of the plan and stay where they are.
                        var units = pagifyUnits(parent).filter(function (unit) {
                            return unit.some(function (n) { return n.nodeType !== 3 || n.textContent.trim() !== ""; });
                        });
                        var heights = units.map(pagifyUnitHeight);
                        var chunks = [];
                        var current = [];
                        var used = 0;
                        for (var i = 0; i < units.length; i++) {
                            var unit = units[i];
                            if (heights[i] > target) {
                                var el = unit.length === 1 && unit[0].nodeType === 1 ? unit[0] : null;
                                var sub = el && el.childNodes.length ? pagifyPlanChunks(el, target) : null;
                                if (!sub) return null;
                                if (current.length) chunks.push(current);
                                current = [];
                                used = 0;
                                sub.forEach(function (part, k) { chunks.push([{ el: el, part: part, k: k }]); });
                                continue;
                            }
                            if (current.length && used + heights[i] > target) {
                                chunks.push(current);
                                current = [];
                                used = 0;
                            }
                            unit.forEach(function (n) { current.push({ node: n }); });
                            used += heights[i];
                        }
                        if (current.length) chunks.push(current);
                        return chunks;
                    }

                    function pagifyBuildItem(item) {
                        if (item.node) return item.node;
                        var wrap = item.k === 0 ? item.el : item.el.cloneNode(false);
                        if (item.k > 0 && wrap.removeAttribute) wrap.removeAttribute("id");
                        item.part.forEach(function (it) { wrap.appendChild(pagifyBuildItem(it)); });
                        return wrap;
                    }

                    // Cut a row taller than a page into sub-rows of about target px, at block
                    // boundaries. Sub-rows share the row id (validation treats them as one row) and
                    // hide the borders/padding between them, so they still read as a single row;
                    // a rowspan group's label repeats on a continued page as usual. Returns the
                    // rows (original + new), or null if the row can't be cut.
                    function pagifySplitRow(tr, target) {
                        var cells = Array.from(tr.cells);
                        var plans = cells.map(function (cell) { return pagifyPlanChunks(cell, target); });
                        if (plans.some(function (plan) { return !plan; })) return null;
                        var count = Math.max.apply(null, plans.map(function (plan) { return plan.length; }));
                        if (count < 2) return null;
                        var newRows = [];
                        for (var k = 1; k < count; k++) {
                            var row = tr.cloneNode(false);
                            row.removeAttribute("id");
                            newRows.push(row);
                        }
                        cells.forEach(function (cell, j) {
                            var hadHideBottom = cell.hasAttribute("data-pagify-hide-bottom");
                            var parts = plans[j].map(function (chunk) { return chunk.map(pagifyBuildItem); });
                            for (var k = 1; k < count; k++) {
                                var next = cell.cloneNode(false);
                                next.removeAttribute("id");
                                next.setAttribute("data-pagify-hide-top", "");
                                next.setAttribute("data-pagify-cont-top", "");
                                if (cell.hasAttribute("data-pagify-span-group")) next.setAttribute("data-pagify-span-filler", "");
                                if (k < count - 1) {
                                    next.setAttribute("data-pagify-hide-bottom", "");
                                    next.setAttribute("data-pagify-cont-bottom", "");
                                } else if (!hadHideBottom) {
                                    next.removeAttribute("data-pagify-hide-bottom");
                                }
                                (parts[k] || []).forEach(function (n) { next.appendChild(n); });
                                newRows[k - 1].appendChild(next);
                            }
                            cell.setAttribute("data-pagify-hide-bottom", "");
                            cell.setAttribute("data-pagify-cont-bottom", "");
                        });
                        var after = tr.nextSibling;
                        newRows.forEach(function (row) { tr.parentNode.insertBefore(row, after); });
                        return [tr].concat(newRows);
                    }

                    // Replace each rowspan with one cell per covered row ("fillers"). The edges between
                    // them are hidden via data-pagify-hide-top/-bottom (CSS: border-*-style: hidden),
                    // so the group still reads as one merged cell; removing an attribute at a page
                    // edge brings back the author's own border, inline or from a stylesheet.
                    function pagifyFlattenRowspans(content) {
                        content.querySelectorAll("tbody").forEach(function (tbody) {
                            if (tbody.closest(".header, .footer")) return;
                            var rows = Array.from(tbody.rows);
                            var colOf = new Map();
                            var spans = [];
                            rows.forEach(function (row, r) {
                                var taken = new Set();
                                spans.forEach(function (s) { if (s.from < r && s.to > r) taken.add(s.col); });
                                var col = 0;
                                Array.from(row.cells).forEach(function (cell) {
                                    while (taken.has(col)) col++;
                                    colOf.set(cell, col);
                                    if (cell.rowSpan > 1) {
                                        spans.push({ cell: cell, col: col, from: r, to: Math.min(r + cell.rowSpan, rows.length) });
                                    }
                                    col += cell.colSpan || 1;
                                });
                            });
                            spans.forEach(function (span) {
                                var cell = span.cell;
                                cell.rowSpan = 1;
                                cell.setAttribute("data-pagify-span-group", String(pagifySpanLabels.length));
                                pagifySpanLabels.push(cell.innerHTML);
                                if (span.to - span.from > 1) cell.setAttribute("data-pagify-hide-bottom", "");
                                for (var r = span.from + 1; r < span.to; r++) {
                                    var filler = cell.cloneNode(false);
                                    filler.removeAttribute("id");
                                    filler.removeAttribute("data-pagify-hide-bottom");
                                    filler.setAttribute("data-pagify-span-filler", "");
                                    filler.setAttribute("data-pagify-hide-top", "");
                                    if (r < span.to - 1) filler.setAttribute("data-pagify-hide-bottom", "");
                                    var before = Array.from(rows[r].cells).find(function (c) { return colOf.get(c) > span.col; });
                                    rows[r].insertBefore(filler, before || null);
                                    colOf.set(filler, span.col);
                                }
                            });
                        });
                    }

                    // Every source body row must be VISIBLE on some page (inside a page content
                    // box) and fill as many columns as its header.
                    function pagifyValidateRows() {
                        var visible = new Set();
                        var clipped = new Set();
                        var misaligned = new Set();
                        document.querySelectorAll(".pagedjs_page").forEach(function (page) {
                            // Bound by the fixed page area, not the content box (a caller stylesheet
                            // could stretch the content box past the page, over the footer).
                            var areaEl = page.querySelector(".pagedjs_page_content");
                            var boundEl = page.querySelector(".pagedjs_area") || areaEl;
                            if (!areaEl) return;
                            var area = boundEl.getBoundingClientRect();
                            areaEl.querySelectorAll("tbody > tr[" + PAGIFY_ROW + "]").forEach(function (tr) {
                                var r = tr.getBoundingClientRect();
                                var inside = r.height > 0 && r.left >= area.left - 1 && r.right <= area.right + 1 &&
                                    r.top >= area.top - 1 && r.bottom <= area.bottom + 1;
                                (inside ? visible : clipped).add(tr.getAttribute(PAGIFY_ROW));
                            });
                            areaEl.querySelectorAll("table").forEach(function (table) {
                                var head = table.querySelector(":scope > thead > tr");
                                if (!head) return;
                                var span = function (tr) {
                                    return Array.from(tr.cells).reduce(function (n, c) { return n + (c.colSpan || 1); }, 0);
                                };
                                var cols = span(head);
                                table.querySelectorAll(":scope > tbody > tr[" + PAGIFY_ROW + "]").forEach(function (tr) {
                                    if (span(tr) !== cols) misaligned.add(tr.getAttribute(PAGIFY_ROW));
                                });
                            });
                        });
                        var label = function (id) { return pagifySourceRows[Number(id)]; };
                        var missing = pagifySourceRows.map(function (_, i) { return String(i); })
                            .filter(function (id) { return !visible.has(id); });
                        var cut = Array.from(clipped).filter(function (id) { return visible.has(id); });
                        var result = {
                            source: pagifySourceRows.length,
                            printed: visible.size,
                            missing: missing.map(label),
                            clipped: cut.map(label),
                            misaligned: Array.from(misaligned).map(label),
                            ok: missing.length === 0 && cut.length === 0 && misaligned.size === 0
                        };
                        if (result.ok) console.log("Pagify row check OK: " + result.printed + "/" + result.source + " rows printed.");
                        else console.error("Pagify row check FAILED", result);
                        window.__pagifyRowValidation = result;
                        return result;
                    }

                    class StableTablePagination extends Handler {
                        constructor(chunker, polisher, caller) {
                            super(chunker, polisher, caller);
                        }

                        beforeParsed(content) {
                            var rows = pagifyBodyRows(content);
                            rows.forEach(function (tr, i) { tr.setAttribute(PAGIFY_ROW, String(i)); });
                            pagifySourceRows = rows.map(pagifyRowLabel);
                            pagifyFlattenRowspans(content);
                            pagifyTagKeepWholeRows(content, rows);
                        }

                        // Repeat <colgroup> (column widths) and <thead> as soon as Paged.js rebuilds a
                        // split table on a new page, before it measures overflow (see fix 1 above).
                        renderNode(clone, node) {
                            // A rowspan filler opening a continued page shows its group label. Done
                            // here, before Paged.js measures the page, since the label may wrap.
                            if (clone.nodeType === 1 && clone.hasAttribute("data-pagify-span-filler")) {
                                var fillerRow = clone.parentElement;
                                var fillerTable = fillerRow && fillerRow.closest("table[data-split-from]");
                                if (fillerTable && fillerRow.parentElement && fillerRow.parentElement.rows[0] === fillerRow) {
                                    clone.removeAttribute("data-pagify-hide-top");
                                    clone.innerHTML = pagifySpanLabels[Number(clone.getAttribute("data-pagify-span-group"))] || "";
                                }
                            }
                            var el = clone.nodeType === 1 ? clone : clone.parentElement;
                            var table = el && el.closest("table[data-split-from]");
                            if (!table || table.hasAttribute("data-pagify-repeated")) return;
                            table.setAttribute("data-pagify-repeated", "");
                            var srcEl = node.nodeType === 1 ? node : node.parentElement;
                            var srcTable = srcEl && srcEl.closest("table");
                            if (!srcTable) return;
                            // Source order: <colgroup>s, then <thead>, then the rows already here.
                            var anchor = table.firstChild;
                            if (!table.querySelector(":scope > colgroup")) {
                                srcTable.querySelectorAll(":scope > colgroup").forEach(function (colgroup) {
                                    table.insertBefore(colgroup.cloneNode(true), anchor);
                                });
                            }
                            var sourceHeader = srcTable.querySelector(":scope > thead");
                            if (sourceHeader && !table.querySelector(":scope > thead")) {
                                table.insertBefore(sourceHeader.cloneNode(true), anchor);
                            }
                        }

                        afterPageLayout(pageElement) {
                            // Close / re-open hidden edges at the page edges (colour-only: no reflow).
                            pageElement.querySelectorAll("tbody").forEach(function (tbody) {
                                var rows = tbody.rows;
                                if (!rows.length) return;
                                rows[rows.length - 1].querySelectorAll("[data-pagify-hide-bottom]").forEach(function (cell) {
                                    cell.removeAttribute("data-pagify-hide-bottom");
                                });
                                rows[0].querySelectorAll("[data-pagify-hide-top]").forEach(function (cell) {
                                    cell.removeAttribute("data-pagify-hide-top");
                                });
                            });

                            // Hide tables with no body rows (some generators emit empty tables).
                            pageElement.querySelectorAll("table").forEach(function (table) {
                                if (table.querySelector("tbody > tr")) return;
                                table.style.visibility = "hidden";
                                table.style.position = "absolute";
                                var lineSpacer = table.nextElementSibling;
                                if (lineSpacer) {
                                    lineSpacer.style.visibility = "hidden";
                                    lineSpacer.style.position = "absolute";
                                }
                            });
                        }
                    }
                    registerHandlers(StableTablePagination);`;
    }

    /**
     * Legacy table handler (default, `stableTablePagination: false`). Kept byte-for-byte
     * as it shipped so the flag-off output is unchanged during the gradual rollout.
     */
    static getLegacyTableHandlerScript() {
        return `                    class RepeatingTableHeaders extends Handler {
                        constructor(chunker, polisher, caller) {
                            super(chunker, polisher, caller);
                        }

                        beforePageLayout(page) {
                            // console.log("page", page);
                            // page.height = 200;
                        }

                        afterPageLayout(pageElement, page, breakToken, chunker) {
                            // Find all split table elements
                            let tables = pageElement.querySelectorAll("table[data-split-from]");

                            tables.forEach((table) => {
                                // There is an edge case where the previous page table
                                // has zero height (isn't visible).
                                // To avoid double header we will only add header if there is none.
                                let tableHeader = table.querySelector("thead");
                                if (tableHeader) {
                                    return;
                                }

                                // Get the reference UUID of the node
                                let ref = table.dataset.ref;
                                // Find the node in the original source
                                let sourceTable = chunker.source.querySelector("[data-ref='" + ref + "']");

                                // Find if there is a header
                                let sourceHeader = sourceTable.querySelector("thead");
                                if (sourceHeader) {
                                    console.log("Table header was cloned, because it is splitted.");
                                    // Clone the header element
                                    let clonedHeader = sourceHeader.cloneNode(true);
                                    // Insert the header at the start of the split table
                                    table.insertBefore(clonedHeader, table.firstChild);
                                }
                            });

                            // Find all tables
                            tables = pageElement.querySelectorAll("table");

                            // special case which might not fit for everyone
                            tables.forEach((table) => {
                                // if the table has no rows in body, hide it.
                                // This happens because my render engine creates empty tables.
                                let sourceBody = table.querySelector("tbody > tr");
                                if (!sourceBody) {
                                    console.log("Table was hidden, because it has no rows in tbody.");
                                    table.style.visibility = "hidden";
                                    table.style.position = "absolute";

                                    var lineSpacer = table.nextSibling;
                                    if (lineSpacer) {
                                        lineSpacer.style.visibility = "hidden";
                                        lineSpacer.style.position = "absolute";
                                    }
                                }
                            });
                            try {
                                // setting the page to show overflowing content
                                let contents = pageElement.querySelectorAll(".pagedjs_page_content");
                                contents.forEach((content) => {
                                    content.style.height = 'max-content';
                                });
                            } catch (e) {
                                console.warn("Failed to set page content height to max-content", e);
                            }
                        }
                    }
                    registerHandlers(RepeatingTableHeaders);`;
    }

    /**
     * Get PDF generation script
     */
    static getPdfGenerationScript(instanceId, beautifyListItems = true, page_size = "a4") {
        return `
            function getBulletChar(listStyleType) {
                const bulletMap = {
                    'disc': '•',
                    'circle': '○',
                    'square': '▪',
                    'none': '',
                };
                return bulletMap[listStyleType] || '•';
            }

            function beautifyListItemsHandler(originalBody) {
                try {
                    const clonedBody = originalBody?.cloneNode?.(true);
                    if (!clonedBody) return originalBody;

                    clonedBody?.querySelectorAll?.('ul, ol')?.forEach?.((list) => {
                        list?.querySelectorAll?.('li')?.forEach?.((li) => {
                            const originalLi = originalBody?.querySelector?.(\`[data-ref="\${li?.getAttribute?.('data-ref')}"]\`) || li;
                            const computedStyle = window?.getComputedStyle?.(originalLi);
                            
                            if (computedStyle?.listStyleType !== 'none') {
                                li.style.listStyleType = 'none';
                                li.style.position = 'relative';
                                li.style.paddingLeft = '-1.2em';
                                li.style.paddingTop = '-0.3em';
                                
                                const bullet = document?.createElement?.('span');
                                if (bullet) {
                                    bullet.textContent = getBulletChar(computedStyle?.listStyleType);
                                    bullet.style.cssText = \`
                                        position: absolute;
                                        left: -1.4em;
                                        top: -0.28em;
                                        line-height: 1.25rem;
                                        font-size: 1.2em;
                                        font-weight: bold;
                                        color: currentColor;
                                    \`;
                                    
                                    li?.insertBefore?.(bullet, li?.firstChild);
                                }
                            }
                        });
                    });

                    return clonedBody;
                } catch (error) {
                    console.error('beautifyListItemsHandler failed:', error);
                    return originalBody;
                }
            }

            // Generate PDF blob function
            async function generatePdfBlob() {
                try {
                    console.log('Starting PDF generation...');
                    
                    let html2pdfLib;
                    await new Promise((resolve, reject) => {
                        if (typeof window.html2pdf === 'function') {
                            resolve();
                            return;
                        }
                        
                        const script = document.createElement('script');
                        script.src = 'https://unpkg.com/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js';
                        script.onload = () => {
                            if (typeof window.html2pdf === 'function') {
                                resolve();
                            } else {
                                reject(new Error('html2pdf not available after loading script'));
                            }
                        };
                        script.onerror = () => reject(new Error('Failed to load html2pdf script'));
                        document.head.appendChild(script);
                    });
                    
                    html2pdfLib = window.html2pdf;
                    console.log('html2pdf loaded successfully');
                    await startPdfGeneration();
        
                } catch (error) {
                    console.error("PDF generation error:", error);
                    window.parent.postMessage({ 
                        type: "PDF_ERROR", 
                        error: error.message,
                        iter: "${instanceId}"
                    }, "*");
                }
            }

            async function startPdfGeneration() {
                try {
                    const originalBody = document.body;
                    let targetElement = originalBody;

                    if (${beautifyListItems}) {
                        targetElement = beautifyListItemsHandler(originalBody);
                    }

                    console.log('Using body element for PDF generation');
                    console.log('Element innerHTML length:', targetElement?.innerHTML?.length);
                    
                    if (!targetElement || targetElement?.innerHTML?.trim()?.length === 0) {
                        throw new Error('No content found in body element');
                    }
                    
                    console.log('Estimated pages:', totalPages);
                    
                    const opt = {
                        margin: [0,0,0,0],
                        filename: "document.pdf",
                        image: { 
                            type: "jpeg", 
                            quality: 0.98 
                        },
                        html2canvas: { 
                            scale: 2,
                            useCORS: true,
                            allowTaint: false,
                            backgroundColor: '#ffffff',
                            scrollX: 0,
                            scrollY: 0,
                        },
                        jsPDF: { 
                            unit: "mm", 
                            format: ${JSON.stringify(page_size.toLowerCase())},
                            orientation: "portrait",
                            compress: true
                        }
                    };
                    
                    console.log('Starting html2pdf conversion with body element');
                    
                    window.html2pdf().set(opt).from(targetElement)
                        .toPdf()
                        .get("pdf").then(pdf => {
                            const pageCount = pdf.internal.getNumberOfPages();
                            console.log('Generated PDF with', pageCount, 'pages');
                            
                            // Remove extra pages if necessary
                            if (pageCount > totalPages && totalPages > 0) {
                                for (let i = pageCount; i > totalPages; i--) {
                                    pdf.deletePage(i);
                                }
                            }
                        })
                        .outputPdf("blob").then(function (blob) {
                            console.log('PDF blob generated:', blob);
                            const blobUrl = URL.createObjectURL(blob);
                            console.log("Blob URL:", blobUrl);
                            window.parent.postMessage({ 
                                type: "PDF_READY", 
                                blobUrl: blobUrl,
                                iter: "${instanceId}",
                                blob: blob
                            }, "*");
                        })
                        .catch(error => {
                            console.error("PDF generation failed:", error);
                            window.parent.postMessage({ 
                                type: "PDF_ERROR", 
                                error: error.message,
                                iter: "${instanceId}"
                            }, "*");
                        });
                        
                } catch (error) {
                    console.error("PDF generation error:", error);
                    window.parent.postMessage({ 
                        type: "PDF_ERROR", 
                        error: error.message,
                        iter: "${instanceId}"
                    }, "*");
                }
            }
        `;
    }
}

/**
 * Build the complete paginated HTML document (the same one `pagify.render()` mounts in its iframe).
 * Takes render()'s options; see index.d.ts. `pageNumberCSS` may be passed precomputed (render does).
 * @returns {string}
 */
function buildIframeHTML(options = {}) {
    const {
        instanceId = "pagify",
        body_html = "",
        header_html = "",
        footer_html = "",
        head_html = "",
        page_size = "A4",
        margin_left = "0mm",
        margin_right = "0mm",
        header_height = "0mm",
        footer_height = "0mm",
        page_number_selector = "",
        footer_only_on_last_page = false,
        page_padding_top = "16px",
        isViewOnlySkipMakingPDF = false,
        beautifyListItems = true,
        stableTablePagination = false,
        pagedjs_url = DEFAULT_PAGEDJS_URL,
        pagedjs_inline = null,
        completionCallbackName = null,
    } = options;
    const pageNumberCSS = options.pageNumberCSS !== undefined
        ? options.pageNumberCSS
        : buildPageNumberCSS(page_number_selector);
    return PagifyTemplates.buildIframeHTML({
        instanceId,
        body_html,
        header_html,
        footer_html,
        head_html,
        page_size,
        margin_left,
        margin_right,
        header_height,
        footer_height,
        footer_only_on_last_page,
        page_padding_top,
        pageNumberCSS,
        isViewOnlySkipMakingPDF,
        beautifyListItems,
        stableTablePagination,
        pagedjs_url,
        pagedjs_inline,
        completionCallbackName,
    });
}

exports.buildIframeHTML = buildIframeHTML;
exports.buildPageNumberCSS = buildPageNumberCSS;
exports.DEFAULT_PAGEDJS_URL = DEFAULT_PAGEDJS_URL;
exports.PAGEDJS_POLYFILL_PATH = PAGEDJS_POLYFILL_PATH;
exports.PagifyTemplates = PagifyTemplates;
