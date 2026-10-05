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

/** Stock Paged.js 0.4.3: what the iframe loads with stableTablePagination off (unchanged behaviour). */
const DEFAULT_PAGEDJS_URL = "https://unpkg.com/pagedjs@0.4.3/dist/paged.polyfill.js";

/**
 * Eka's fork of Paged.js 0.4.3 (https://github.com/eka-care/pagedjs), vendored in this folder as
 * ./paged.polyfill.js. It paginates tables without losing rows: no table handler is needed with it.
 */
const PAGEDJS_FORK_VERSION = "0.4.3-eka.1";

/** This package's version. Keep in sync with package.json (a test checks). */
const SDK_VERSION = "1.5.0";

/**
 * Where the browser loads the vendored fork with stableTablePagination on: this package's own copy on
 * unpkg, so the SDK and the polyfill it was tested with always ship together.
 */
const FORK_PAGEDJS_URL = `https://unpkg.com/@eka-care/pagify-sdk@${SDK_VERSION}/pagify-utils/paged.polyfill.js`;

/**
 * Absolute path of the vendored fork's polyfill (Node only; null in the browser). Read it and pass it
 * as `pagedjs_inline` to render without network access.
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
    const src = String(pagedjs_url).replace(/"/g, "&quot;");
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
        pagedjs_url = null,
        pagedjs_inline = null,
        completionCallbackName = null,
    }) {
        // stableTablePagination runs Eka's Paged.js fork; off, stock 0.4.3 (as before). An explicit URL wins.
        const pagedJsSrc = pagedjs_url || (stableTablePagination ? FORK_PAGEDJS_URL : DEFAULT_PAGEDJS_URL);
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
                    ${pagedJsScriptTag(pagedJsSrc, pagedjs_inline)}
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
                        tr {
                            break-inside: avoid;
                        }
                        
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
     * `stableTablePagination: true`. The iframe runs Eka's Paged.js fork, which itself repeats <thead> and
     * <colgroup> on continued pages, keeps rows whole when they fit, breaks rows taller than a page, and
     * closes rowspan cells at page edges (https://github.com/eka-care/pagedjs). So there is no table
     * workaround here, only:
     * - hiding tables with no body rows (some generators emit empty tables), as the legacy handler does;
     * - `pagifyValidateRows()`: after pagination, every body row must be VISIBLE inside a page area. A
     *   lost or cut row is reported rather than shipping a short PDF silently. Rows are identified by
     *   number (1 = first body row in the source), never by their text, which may be patient data.
     */
    static getStableTablePaginationScript() {
        return `
                    var PAGIFY_ROW = "data-pagify-row";
                    var pagifySourceRowCount = 0;

                    // Body rows we own: tbody rows outside the running header/footer.
                    function pagifyBodyRows(root) {
                        return Array.from(root.querySelectorAll("tbody > tr")).filter(function (tr) {
                            return !tr.closest(".header, .footer");
                        });
                    }

                    function pagifyValidateRows() {
                        var visible = new Set();
                        var clipped = new Set();
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
                                (inside ? visible : clipped).add(Number(tr.getAttribute(PAGIFY_ROW)));
                            });
                        });
                        var missing = [];
                        for (var n = 1; n <= pagifySourceRowCount; n++) {
                            if (!visible.has(n)) missing.push(n);
                        }
                        // A row split across pages is fine; one with a part outside the page area is cut.
                        var cut = Array.from(clipped).filter(function (n) { return visible.has(n); }).sort(function (a, b) { return a - b; });
                        var result = {
                            source: pagifySourceRowCount,
                            printed: visible.size,
                            missing: missing,
                            clipped: cut,
                            ok: missing.length === 0 && cut.length === 0
                        };
                        if (result.ok) console.log("Pagify row check OK: " + result.printed + "/" + result.source + " rows printed.");
                        else console.error("Pagify row check FAILED", result);
                        window.__pagifyRowValidation = result;
                        return result;
                    }

                    class PagifyTables extends Handler {
                        constructor(chunker, polisher, caller) {
                            super(chunker, polisher, caller);
                        }

                        beforeParsed(content) {
                            var rows = pagifyBodyRows(content);
                            rows.forEach(function (tr, i) { tr.setAttribute(PAGIFY_ROW, String(i + 1)); });
                            pagifySourceRowCount = rows.length;
                        }

                        afterPageLayout(pageElement) {
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
                    registerHandlers(PagifyTables);`;
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
        pagedjs_url = null,
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
exports.FORK_PAGEDJS_URL = FORK_PAGEDJS_URL;
exports.PAGEDJS_FORK_VERSION = PAGEDJS_FORK_VERSION;
exports.SDK_VERSION = SDK_VERSION;
exports.PAGEDJS_POLYFILL_PATH = PAGEDJS_POLYFILL_PATH;
exports.PagifyTemplates = PagifyTemplates;
