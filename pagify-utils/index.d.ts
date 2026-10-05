/**
 * pagify-utils — the single source of the HTML document Pagify paginates.
 * Zero dependencies; usable from the browser SDK and from Node (e.g. a Puppeteer worker).
 */

export interface BuildIframeHTMLOptions {
  /** Main HTML content for the PDF body */
  body_html?: string;
  /** HTML content for page headers */
  header_html?: string;
  /** HTML content for page footers */
  footer_html?: string;
  /** Additional HTML for the <head> section */
  head_html?: string;
  /** Page size (A4, A5, Letter, ...). Default "A4" */
  page_size?: string;
  /** Left page margin. Default "0mm" */
  margin_left?: string;
  /** Right page margin. Default "0mm" */
  margin_right?: string;
  /** Height reserved for the header (top page margin). Default "0mm" */
  header_height?: string;
  /** Height reserved for the footer (bottom page margin). Default "0mm" */
  footer_height?: string;
  /** CSS selector that gets "Page N of M" */
  page_number_selector?: string;
  /** Show footer only on the last page */
  footer_only_on_last_page?: boolean;
  /** Top padding for page content. Default "16px" */
  page_padding_top?: string;
  /**
   * Skip the in-page html2pdf step (default false). Set true when something else makes the PDF,
   * e.g. Puppeteer's page.pdf().
   */
  isViewOnlySkipMakingPDF?: boolean;
  /** html2pdf only: bullet-point fixes for list items. Default true */
  beautifyListItems?: boolean;
  /**
   * Paginate with Eka's Paged.js fork (no lost or cut table rows) and report the row check.
   * Default false: stock Paged.js 0.4.3 + the legacy header handler, byte-identical to 1.4.3.
   */
  stableTablePagination?: boolean;
  /** Where to load Paged.js from. Default FORK_PAGEDJS_URL with stableTablePagination, else DEFAULT_PAGEDJS_URL */
  pagedjs_url?: string;
  /**
   * Paged.js source to inline instead of loading a URL (servers). Use the vendored fork:
   * fs.readFileSync(PAGEDJS_POLYFILL_PATH, "utf8").
   */
  pagedjs_inline?: string | null;
  /**
   * Name of a global function called once pagination finishes, with
   * { total, validation }. For Puppeteer: page.exposeFunction(name, fn) before page.setContent(html).
   */
  completionCallbackName?: string | null;
  /** Id used in the page's postMessage events. Default "pagify" */
  instanceId?: string;
  /** Precomputed page-number CSS (the SDK passes it); otherwise built from page_number_selector */
  pageNumberCSS?: string;
}

/** Payload passed to the `completionCallbackName` function */
export interface PaginationComplete {
  /** Number of pages */
  total: number;
  /** Row check (only with stableTablePagination, else null). Rows by number, 1 = first body row */
  validation: {
    source: number;
    printed: number;
    missing: number[];
    clipped: number[];
    ok: boolean;
  } | null;
}

/** Build the complete paginated HTML document (the one `pagify.render()` mounts in its iframe). */
export function buildIframeHTML(options?: BuildIframeHTMLOptions): string;

/** CSS that prints "Page N of M" before the given selector ("" when no selector) */
export function buildPageNumberCSS(page_number_selector?: string): string;

/** Stock Paged.js 0.4.3 on unpkg: loaded with stableTablePagination off */
export const DEFAULT_PAGEDJS_URL: string;

/** This package's vendored copy of Eka's Paged.js fork on unpkg: loaded with stableTablePagination on */
export const FORK_PAGEDJS_URL: string;

/** Version of the vendored fork, e.g. "0.4.3-eka.1" */
export const PAGEDJS_FORK_VERSION: string;

/** This package's version (part of FORK_PAGEDJS_URL) */
export const SDK_VERSION: string;

/** Absolute path of the vendored fork's paged.polyfill.js (Node only; null in the browser) */
export const PAGEDJS_POLYFILL_PATH: string | null;
