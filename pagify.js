/**
 * Pagify SDK - Modular Version
 * Provides a simple API for rendering HTML content as paginated PDFs using Paged.js
 * 
 * Usage:
 * - Render paginated content: pagify.render(options)
 * 
 * @author Pagify SDK
 * @version 1.2.0
 * @license MIT
 */

import { Previewer } from 'pagedjs';
import html2pdf from 'html2pdf.js';

/**
 * Pagify SDK Class
 * Handles PDF rendering with pagination using Paged.js and html2pdf.js
 */
class PagifySDK {
    constructor() {
        this.callbackStorage = {};

        // Active render jobs indexed by unique job id
        // where each JOB is 1 pdf being generatting. PDF / view
        this.jobs = {};

        // Initialize message listener
        this.initMessageListener();
    }


    /**
     * Initialize message listener for iframe communication
     */
    initMessageListener() {
        if (typeof window === "undefined") return;

        window.addEventListener("message", async (event) => {
            const data = event?.data;
            if (!data?.type) return;

            if (data.type === "renderpdf") {
                this.callbackStorage[data.iter]?.();
                delete this.callbackStorage[data.iter];
                return;
            }

            const job = this.jobs[data.iter];
            if (!job) return;
            // Only trust messages coming from this job's own iframe.
            if (event.source !== job.iframe.contentWindow) return;

            // Intermediate report (stableTablePagination only): pagination finished, PDF/preview
            // still to come — so return before the teardown below, or a headless job would lose
            // its iframe mid-render.
            if (data.type === "PAGINATION_VALIDATION") {
                const result = data.result;
                if (result && !result.ok) console.error("Pagify pagination validation failed:", result);
                try {
                    await job.onPaginationValidation?.(result);
                } catch (err) {
                    console.error("Pagify callback error:", err);
                }
                window.dispatchEvent(new CustomEvent("paginationValidation", { detail: result }));
                return;
            }

            // IMPORTANT: await the caller's callback before teardown.
            // The blobUrl is created with URL.createObjectURL INSIDE the iframe,
            // so it is revoked the moment the iframe is removed. A headless
            // caller does `await fetch(blobUrl)` to read the blob — if we reap
            // the iframe synchronously we revoke the URL mid-read and the fetch
            // fails intermittently. Draining the consumer first makes teardown
            try {
                switch (data.type) {
                    case "PDF_READY": {
                        // if u make blob url in iframe the URL fies with the iframe
                        // hence make url in pagify context
                        // pagify ka GEC, is top level
                        // HOST is also top level JS
                        // hence we should make BLOB url in top level JS else when we rip off the iframe the bLOB url also wont open
                        // and if callers have done, window.open or if caller does await fetch(blobUrl) or similar it'll fail mid BYTE
                        const url = data.blob ? URL.createObjectURL(data.blob) : data.blobUrl;
                        if (data.blob) job.blobUrl = url;
                        await job.onPdfReady?.(url);
                        window.dispatchEvent(new CustomEvent("pdfReady", { detail: { blobUrl: url } }));
                        break;
                    }
                    case "PDF_ERROR":
                        console.error("PDF generation error:", data.error);
                        await job.onPdfError?.(data.error);
                        window.dispatchEvent(new CustomEvent("pdfError", { detail: { error: data.error } }));
                        break;
                    case "PREVIEW_READY":
                        await job.onPreviewReady?.({ success: true });
                        window.dispatchEvent(new CustomEvent("previewReady", { detail: { success: true } }));
                        break;
                    case "PREVIEW_ERROR":
                        console.error("Preview error:", data.error);
                        await job.onPreviewReady?.({ success: false, error: data.error });
                        window.dispatchEvent(new CustomEvent("previewError", { detail: { success: false, error: data.error } }));
                        break;
                }
            } catch (err) {
                console.error("Pagify callback error:", err);
            }

            // cleanup policy:
            // - headless worker (no caller container): the iframe was only used to
            //   produce the blob, so remove it now that the caller has drained it.
            // - container-mounted (caller owns the visible view): keep the iframe;
            //   the caller removes it via job.cleanup() on their own schedule.
            if (job.hasContainer) {
                job.onPdfReady = job.onPdfError = job.onPreviewReady = null; // prevent double-fire
            } else {
                this.destroyJob(data.iter);
            }
        }, false);
    }

    /**
     * Load html2pdf library via script tag as fallback
     */
    loadHtml2PdfLibrary() {
        return new Promise((resolve, reject) => {
            // Check if html2pdf is already available
            if (typeof window.html2pdf === 'function') {
                resolve(window.html2pdf);
                return;
            }

            // Create script tag to load html2pdf
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js';
            script.onload = () => {
                if (typeof window.html2pdf === 'function') {
                    resolve(window.html2pdf);
                } else {
                    reject(new Error('html2pdf not available after loading script'));
                }
            };
            script.onerror = () => reject(new Error('Failed to load html2pdf script'));
            document.head.appendChild(script);
        });
    }

    /**
     * Render HTML content as a paginated PDF
     * @param {Object} options - Configuration options for PDF rendering
     * @param {string} options.body_html - Main HTML content for the PDF body
     * @param {string} options.header_html - HTML content for page headers
     * @param {string} options.footer_html - HTML content for page footers
     * @param {string} options.head_html - Additional HTML for the <head> section
     * @param {string} options.page_size - Page size (A4, Letter, etc.)
     * @param {string} options.margin_left - Left page margin
     * @param {string} options.margin_right - Right page margin
     * @param {string} options.header_height - Height reserved for header
     * @param {string} options.footer_height - Height reserved for footer
     * @param {string} options.page_number_selector - CSS selector for page numbering
     * @param {boolean} options.footer_only_on_last_page - Show footer only on last page
     * @param {string} options.page_padding_top - Top padding for page content
     * @param {function} options.callback - Function called when rendering completes
     * @param {function} options.onPdfReady - Callback when PDF blob is ready (receives blobUrl)
     * @param {function} options.onPdfError - Callback when PDF generation fails (receives error)
     * @param {string} options.containerSelector - CSS selector for container element
     * @param {boolean} options.isViewOnlySkipMakingPDF - If true, only render preview without generating PDF
     * @param {function} options.onPreviewReady - Callback when in preview only mode, fired on iframe ready in DOM (receives {success: boolean, error?: string})
     * @param {boolean} options.beautifyListItems - If true, apply bullet point fixes to list items (default: true)
     * @param {boolean} options.stableTablePagination - Opt-in (default: false) table pagination fixes, for
     *   gradual rollout: repeat <thead> without dropping rows, keep rows whole only when they fit on a page
     *   (taller rows split instead of breaking layout), paginate rowspan groups, and validate that every
     *   body row is visible in the output. See README → "Stable table pagination".
     * @param {function} options.onPaginationValidation - Called once pagination finishes (only with
     *   stableTablePagination) with { source, printed, missing, clipped, misaligned, ok }.
     * @returns {Promise<{id: string, cleanup: function, isAlive: function}>} job handle.
     *   When a container is passed the iframe is the caller's view and is NOT auto-removed;
     *   call handle.cleanup() on unmount to remove it. Headless (no container) jobs self-clean
     *   once the blob is delivered.
     */
    async render({
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
        callback = null,
        onPdfReady = null,
        onPdfError = null,
        containerSelector = null,
        isViewOnlySkipMakingPDF = false,
        onPreviewReady = null,
        beautifyListItems = true,
        stableTablePagination = false,
        onPaginationValidation = null,
    }) {
        try {
            // Unique job id so that we are stable, irrespective of caller using as singleton or multiple instances
            const instanceId = this.generateJobId();

            // Store callback for later execution
            this.callbackStorage[instanceId] = callback;

            // Generate page numbering CSS if selector is provided
            const pageNumberCSS = page_number_selector
                ? `${page_number_selector}::before {
                    content: "Page " counter(page) " of " counter(pages) " ";
                }`
                : "";

            // Build complete HTML document for the iframe
            const iframeHTML = this.buildIframeHTML({
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
            });

            // Resolve mount target (container if found, else document.body)
            const container = this.getContainer(containerSelector);
            const hasContainer = container !== document.body;

            // LEARNING
            // previoiusly we used to do document.querySelector all and cleanup
            // this means callers could NEVER have 2 views side by side
            // hence instead of document.querySelectorAll we move to  container.querySelectorAll
            
            // this executes before each innvocation so before rendering each view > this would run and clean up BUT NOT DOM scoped BUT CONTAINER SCOPED
            if (hasContainer) {
                container.querySelectorAll("iframe[data-pagify-job]").forEach((f) =>
                    this.destroyJob(f.getAttribute("data-pagify-job"))
                );
            }

            // Create, tag, and mount iframe
            const iframe = this.createIframe(containerSelector);
            iframe.setAttribute("data-pagify-job", instanceId);
            iframe.srcdoc = iframeHTML;
            container.appendChild(iframe);

            // Register job state (instance-scoped; no shared counter)
            this.jobs[instanceId] = {
                iframe,
                hasContainer,
                onPdfReady,
                onPdfError,
                onPreviewReady,
                onPaginationValidation,
            };

            // Return a handle so the caller can tear down on their own schedule
            return this.makeHandle(instanceId);
        } catch (error) {
            console.error("Pagify render error:", error);
            if (onPdfError) {
                onPdfError(error.message);
            }
        }
    }

    /**
     * Build HTML content for the iframe
     */
    buildIframeHTML({
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
                            ${this.getPagedJSInitScript(instanceId, isViewOnlySkipMakingPDF, stableTablePagination)}
                        }
                    <\/script>
                    <script src="https://unpkg.com/pagedjs@0.4.3/dist/paged.polyfill.js" onload="initializePagination()"><\/script>
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
    getPagedJSInitScript(instanceId, isViewOnlySkipMakingPDF, stableTablePagination = false) {
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
                    }, "*");` : ""}
                    
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
     * 1. Header repeat happens in `renderNode` — BEFORE Paged.js measures the page. The legacy
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
    getStableTablePaginationScript() {
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

                        // Repeat <thead> as soon as Paged.js rebuilds a split table on a new page,
                        // before it measures overflow (see fix 1 above).
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
                            if (!table || table.querySelector(":scope > thead")) return;
                            var srcEl = node.nodeType === 1 ? node : node.parentElement;
                            var srcTable = srcEl && srcEl.closest("table");
                            var sourceHeader = srcTable && srcTable.querySelector(":scope > thead");
                            if (sourceHeader) table.insertBefore(sourceHeader.cloneNode(true), table.firstChild);
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
    getLegacyTableHandlerScript() {
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
    getPdfGenerationScript(instanceId, beautifyListItems = true, page_size = "a4") {
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

    /**
     * Create and configure iframe
     */
    createIframe(containerSelector) {
        const iframe = document.createElement("iframe");
        
        iframe.setAttribute('data-pagify-iframe', 'true');
        // Configure iframe styling based on container selector
        if (containerSelector) {
            // If container is specified, make iframe fill the container
            iframe.style.width = "100%";
            iframe.style.height = "100%";
            iframe.style.border = "none";
        } else {
            // If no container, hide iframe off-screen
            iframe.style.position = "absolute";
            iframe.style.top = "-9999px";
            iframe.style.left = "-9999px";
            iframe.style.border = "none";
        }

        return iframe;
    }

    generateJobId() {
        const rand = (typeof crypto !== "undefined" && crypto.randomUUID)
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2);
        return `pg-${Date.now()}-${rand}`;
    }

    /**
     * Build the caller-facing handle returned from render().
     * @param {string} jobId
     * @returns {{id: string, cleanup: function, isAlive: function}}
     */
    // so when caller does window.pagify.render they get this cleanup method
    makeHandle(jobId) {
        return {
            id: jobId,
            cleanup: () => this.destroyJob(jobId),
            isAlive: () => !!this.jobs[jobId],
        };
    }

    /**
     * Remove a single job's iframe and free its state. Idempotent and
     * instance-scoped — only ever touches the one iframe for this job.
     */
    destroyJob(jobId) {
        const job = this.jobs[jobId];
        if (!job) return;
        job.iframe?.remove();
        delete this.jobs[jobId];
        delete this.callbackStorage[jobId];
    }

    /**
     * Resolve the mount target. Returns the matched container element, or
     * document.body as fallback. No cleanup side-effects.
     */
    getContainer(containerSelector) {
        if (containerSelector) {
            const el = document.querySelector(containerSelector);
            if (el) return el;
            console.warn(`Container with selector "${containerSelector}" not found. Using document.body instead.`);
        }
        return document.body;
    }

    /**
     * Direct PDF generation without iframe (for Node.js environments)
     * @param {Object} options - Same options as render method
     * @returns {Promise<Blob>} - PDF blob
     */
    async generatePDF(options) {
        if (typeof window === "undefined") {
            throw new Error("Direct PDF generation is only available in browser environments");
        }

        return new Promise(async (resolve, reject) => {
            try {
                const modifiedOptions = {
                    ...options,
                    onPdfReady: (blobUrl) => {
                        // Convert blob URL back to blob
                        fetch(blobUrl)
                            .then(response => response.blob())
                            .then(blob => resolve(blob))
                            .catch(error => reject(error));
                    },
                    onPdfError: (error) => {
                        reject(new Error(error));
                    }
                };

                await this.render(modifiedOptions);
            } catch (error) {
                reject(error);
            }
        });
    }
}

// Create singleton instance
const pagify = new PagifySDK();

// Export for ES modules
export default pagify;
export { PagifySDK };

// Also expose on window for browser compatibility
if (typeof window !== "undefined") {
    window.pagify = pagify;
}
