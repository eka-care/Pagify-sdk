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
        // Counter for unique iframe instances
        this.instanceCounter = 1;
        
        // Storage for callback functions indexed by instance ID
        this.callbackStorage = {};
        this.pdfCallbackStorage = {};

        // Initialize message listener
        this.initMessageListener();
    }

    /**
     * Initialize message listener for iframe communication
     */
    initMessageListener() {
        if (typeof window !== 'undefined') {
            window.addEventListener("message", (event) => {
                if (event.data?.type === "renderpdf") {
                    const callback = this.callbackStorage[event.data?.iter];
                    if (callback) {
                        callback();
                    }
                    // Clean up callback storage
                    delete this.callbackStorage[event.data?.iter];
                } else if (event.data?.type === "PDF_READY") {
                    // Handle PDF blob ready event
                    console.log('PDF blob ready:', event.data.blobUrl);
                    
                    // Check if there's a specific callback for this instance
                    const instanceId = event.data?.iter;
                    if (instanceId && this.pdfCallbackStorage[instanceId]?.onPdfReady) {
                        this.pdfCallbackStorage[instanceId].onPdfReady(event.data.blobUrl);
                        delete this.pdfCallbackStorage[instanceId];
                    }
                    
                    // Also trigger global PDF ready event for backward compatibility
                    window.dispatchEvent(new CustomEvent('pdfReady', { 
                        detail: { blobUrl: event.data.blobUrl } 
                    }));
                } else if (event.data?.type === "PDF_ERROR") {
                    // Handle PDF generation error
                    console.error('PDF generation error:', event.data.error);
                    
                    // Check if there's a specific callback for this instance
                    const instanceId = event.data?.iter;
                    if (instanceId && this.pdfCallbackStorage[instanceId]?.onPdfError) {
                        this.pdfCallbackStorage[instanceId].onPdfError(event.data.error);
                        delete this.pdfCallbackStorage[instanceId];
                    }
                    
                    // Also trigger global PDF error event for backward compatibility
                    window.dispatchEvent(new CustomEvent('pdfError', { 
                        detail: { error: event.data.error } 
                    }));
                }
            }, false);
        }
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
     * @param {string} options.containerSelector - CSS selector for container element (optional)
     * @returns {Promise<void>}
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
        containerSelector = null
    }) {
        try {
            // Generate unique instance ID
            const instanceId = this.instanceCounter++;
            
            // Store callback for later execution
            this.callbackStorage[instanceId] = callback;
            
            // Store PDF callbacks for later execution
            if (onPdfReady || onPdfError) {
                this.pdfCallbackStorage[instanceId] = {
                    onPdfReady: onPdfReady,
                    onPdfError: onPdfError
                };
            }

            // Generate page numbering CSS if selector is provided
            const pageNumberCSS = page_number_selector ? 
                `${page_number_selector}::before {
                    content: "Page " counter(page) " of " counter(pages) " ";
                }` : "";

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
                pageNumberCSS
            });

            // Create and configure iframe
            const iframe = this.createIframe(containerSelector);
            iframe.srcdoc = iframeHTML;

            // Insert iframe into specified container or body
            const container = this.getContainer(containerSelector);
            container.appendChild(iframe);

        } catch (error) {
            console.error('Pagify render error:', error);
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
        pageNumberCSS
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
                        
                        // Import and initialize Paged.js
                        ${this.getPagedJSInitScript(instanceId)}
                        
                        // PDF Generation Script
                        ${this.getPdfGenerationScript(instanceId)}
                    <\/script>
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
    getPagedJSInitScript(instanceId) {
        return `
            // Wait for fonts to load before starting pagination
            document.fonts.ready.then(async () => {
                console.log("Fonts are ready");
                try {
                    // Import Paged.js dynamically
                    const { Previewer, Handler, registerHandlers } = await import('https://unpkg.com/pagedjs@0.4.3/dist/paged.esm.js');

                    class RepeatingTableHeaders extends Handler {
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
                            // setting the page to show overflowing content
                            let contents = pageElement.querySelectorAll(".pagedjs_page_content");
                            contents.forEach((content) => {
                                content.style.height = 'max-content';
                            });
                        }
                    }
                    registerHandlers(RepeatingTableHeaders);
                    
                    console.log('Paged.js imported successfully');
                    
                    // Initialize pagination
                    const previewer = new Previewer();
                    const result = await previewer.preview();
                    
                    console.log('Paged.js pagination complete:', result);
                    totalPages = result.total;
                    
                    // Notify parent window that rendering is complete
                    window.parent.postMessage({
                        type: "renderpdf", 
                        iter: ${instanceId}
                    }, "*");

                    // Auto-generate PDF
                    generatePdfBlob();
                    
                } catch (error) {
                    console.error('Failed to load or initialize Paged.js:', error);
                    window.parent.postMessage({ 
                        type: "PDF_ERROR", 
                        error: "Failed to initialize Paged.js: " + error.message,
                        iter: ${instanceId}
                    }, "*");
                }
            });
        `;
    }

    /**
     * Get PDF generation script
     */
    getPdfGenerationScript(instanceId) {
        return `
            // Generate PDF blob function for auto-trigger
            async function generatePdfBlob() {
                try {
                    console.log('Starting PDF generation...');
                    
                    // Try dynamic import first, fallback to script loading
                    let html2pdfLib;
                    try {
                        // Import html2pdf dynamically
                        const html2pdfModule = await import('https://unpkg.com/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js');
                        
                        console.log('html2pdf.js imported successfully');
                        console.log('html2pdf module structure:', Object.keys(html2pdfModule));
                        
                        // Try different ways to access html2pdf function
                        if (typeof html2pdfModule.default === 'function') {
                            html2pdfLib = html2pdfModule.default;
                            console.log('Using html2pdfModule.default');
                        } else if (typeof html2pdfModule.html2pdf === 'function') {
                            html2pdfLib = html2pdfModule.html2pdf;
                            console.log('Using html2pdfModule.html2pdf');
                        } else if (typeof window.html2pdf === 'function') {
                            html2pdfLib = window.html2pdf;
                            console.log('Using window.html2pdf');
                        } else {
                            // Fallback: look for any function in the module
                            const functionKeys = Object.keys(html2pdfModule).filter(key => typeof html2pdfModule[key] === 'function');
                            if (functionKeys.length > 0) {
                                html2pdfLib = html2pdfModule[functionKeys[0]];
                                console.log('Using html2pdfModule.' + functionKeys[0]);
                            } else {
                                throw new Error('html2pdf function not found in imported module');
                            }
                        }
                        
                        if (typeof html2pdfLib !== 'function') {
                            throw new Error('html2pdfLib is not a function. Available keys: ' + Object.keys(html2pdfModule).join(', '));
                        }
                    } catch (importError) {
                        console.warn('Dynamic import failed, trying script tag approach:', importError);
                        
                        // Fallback: load via script tag
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
                        console.log('Using window.html2pdf from script tag');
                    }
                    
                    // Use the whole body element
                    const targetElement = document.body;
                    console.log('Using body element for PDF generation');
                    console.log('Element innerHTML length:', targetElement.innerHTML.length);
                    
                    // Check if element has content
                    if (!targetElement || targetElement.innerHTML.trim().length === 0) {
                        throw new Error('No content found in body element');
                    }
                    
                    console.log('Estimated pages:', totalPages);
                    
                    const opt = {
                        margin: 0,
                        filename: "document.pdf",
                        image: { 
                            type: "jpeg", 
                            quality: 0.98 
                        },
                        html2canvas: { 
                            scale: 2,
                            useCORS: true,
                            allowTaint: false,
                            backgroundColor: '#ffffff'
                        },
                        jsPDF: { 
                            unit: "mm", 
                            format: "a4", 
                            orientation: "portrait",
                            compress: true
                        }
                    };
                    
                    console.log('Starting html2pdf conversion with body element');
                    
                    html2pdfLib().set(opt).from(targetElement)
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
                                iter: ${instanceId}
                            }, "*");
                        })
                        .catch(error => {
                            console.error("PDF generation failed:", error);
                            window.parent.postMessage({ 
                                type: "PDF_ERROR", 
                                error: error.message,
                                iter: ${instanceId}
                            }, "*");
                        });
                        
                } catch (error) {
                    console.error("PDF generation error:", error);
                    window.parent.postMessage({ 
                        type: "PDF_ERROR", 
                        error: error.message,
                        iter: ${instanceId}
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

    /**
     * Get container element for iframe
     */
    getContainer(containerSelector) {
        let container;
        if (containerSelector) {
            container = document.querySelector(containerSelector);
            if (!container) {
                console.warn(`Container with selector "${containerSelector}" not found. Using document.body instead.`);
                container = document.body;
            }
        } else {
            container = document.body;
        }
        return container;
    }

    /**
     * Direct PDF generation without iframe (for Node.js environments)
     * @param {Object} options - Same options as render method
     * @returns {Promise<Blob>} - PDF blob
     */
    async generatePDF(options) {
        if (typeof window === 'undefined') {
            throw new Error('Direct PDF generation is only available in browser environments');
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
if (typeof window !== 'undefined') {
    window.pagify = pagify;
}
