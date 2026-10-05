/**
 * Pagify SDK TypeScript Definitions
 */

export interface PagifyOptions {
  /** Main HTML content for the PDF body */
  body_html?: string;
  
  /** HTML content for page headers */
  header_html?: string;
  
  /** HTML content for page footers */
  footer_html?: string;
  
  /** Additional HTML for the <head> section */
  head_html?: string;
  
  /** Page size (A4, Letter, etc.) */
  page_size?: string;
  
  /** Left page margin */
  margin_left?: string;
  
  /** Right page margin */
  margin_right?: string;
  
  /** Height reserved for header */
  header_height?: string;
  
  /** Height reserved for footer */
  footer_height?: string;
  
  /** CSS selector for page numbering */
  page_number_selector?: string;
  
  /** Show footer only on last page */
  footer_only_on_last_page?: boolean;
  
  /** Top padding for page content */
  page_padding_top?: string;
  
  /** Function called when rendering completes */
  callback?: () => void;
  
  /** Callback when PDF blob is ready (receives blobUrl) */
  onPdfReady?: (blobUrl: string) => void;
  
  /** Callback when PDF generation fails (receives error) */
  onPdfError?: (error: string) => void;
  
  /** CSS selector for container element (optional) */
  containerSelector?: string;

  /**
   * Opt-in (default: false), for gradual rollout: paginate with Eka's fork of Paged.js 0.4.3
   * (https://github.com/eka-care/pagedjs), which repeats <thead>/<colgroup> on continued pages and
   * never loses or cuts table rows, instead of stock 0.4.3 with the legacy header handler. Also
   * checks that every body row printed, reported to onPaginationValidation.
   * With false/omitted, the generated document is byte-identical to 1.4.3.
   */
  stableTablePagination?: boolean;

  /** Called once pagination finishes, with the row check (only with stableTablePagination) */
  onPaginationValidation?: (result: PaginationValidationResult) => void;

  /** Where the iframe loads Paged.js from. Default: this package's copy of the fork on unpkg with
   *  stableTablePagination, else stock pagedjs@0.4.3 on unpkg */
  pagedjs_url?: string;

  /** Paged.js source to inline instead of loading pagedjs_url */
  pagedjs_inline?: string | null;
}

/**
 * Row check reported with stableTablePagination: did every table body row print? A production
 * monitor for documents the fork's own regression suite never saw. Rows are identified by number
 * (1 = first body row in the source, in document order), never by content.
 */
export interface PaginationValidationResult {
  /** Body rows in the source HTML (tbody rows outside the running header/footer) */
  source: number;
  /** Source rows visible inside a page area */
  printed: number;
  /** Numbers of rows not visible on any page */
  missing: number[];
  /** Numbers of rows partly cut off at a page edge */
  clipped: number[];
  /** true when nothing is missing or clipped */
  ok: boolean;
}

export interface PagificationResult {
  /** Total number of pages generated */
  total: number;
}

export class PagifySDK {
  constructor();
  
  /**
   * Render HTML content as a paginated PDF
   * @param options Configuration options for PDF rendering
   * @returns Promise that resolves when rendering starts
   */
  render(options: PagifyOptions): Promise<void>;
  
  /**
   * Direct PDF generation without iframe (for Node.js environments)
   * @param options Same options as render method
   * @returns Promise that resolves with PDF blob
   */
  generatePDF(options: PagifyOptions): Promise<Blob>;
}

declare const pagify: PagifySDK;

export default pagify;

// Global declarations for browser usage
declare global {
  interface Window {
    pagify: PagifySDK;
  }
}
