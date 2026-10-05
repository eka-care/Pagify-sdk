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

// Paged.js and html2pdf.js are loaded inside the iframe (see pagify-utils), never in the host page.
import { buildIframeHTML, buildPageNumberCSS, PagifyTemplates } from './pagify-utils/index.js';

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
     * @param {string} options.pagedjs_url - Where the iframe loads Paged.js from (default: unpkg 0.4.3).
     * @param {string} options.pagedjs_inline - Paged.js source to inline instead of loading a URL.
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
        pagedjs_url = undefined,
        pagedjs_inline = null,
    }) {
        try {
            // Unique job id so that we are stable, irrespective of caller using as singleton or multiple instances
            const instanceId = this.generateJobId();

            // Store callback for later execution
            this.callbackStorage[instanceId] = callback;

            // Generate page numbering CSS if selector is provided
            const pageNumberCSS = buildPageNumberCSS(page_number_selector);

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
                pagedjs_url,
                pagedjs_inline,
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
     * Build HTML content for the iframe. Delegates to pagify-utils, the single source of the
     * document Pagify paginates (also used server-side, e.g. with Puppeteer).
     */
    buildIframeHTML(options) {
        return buildIframeHTML(options);
    }

    /** @deprecated Internal; kept for compatibility. Use pagify-utils. */
    getPagedJSInitScript(instanceId, isViewOnlySkipMakingPDF, stableTablePagination = false) {
        return PagifyTemplates.getPagedJSInitScript(instanceId, isViewOnlySkipMakingPDF, stableTablePagination);
    }

    /** @deprecated Internal; kept for compatibility. Use pagify-utils. */
    getPdfGenerationScript(instanceId, beautifyListItems = true, page_size = "a4") {
        return PagifyTemplates.getPdfGenerationScript(instanceId, beautifyListItems, page_size);
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
