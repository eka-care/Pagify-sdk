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
  /** Opt-in table pagination fixes + row-count validation. Default false (see the SDK README) */
  stableTablePagination?: boolean;
  /** Where to load Paged.js from. Default DEFAULT_PAGEDJS_URL (unpkg, 0.4.3) */
  pagedjs_url?: string;
  /**
   * Paged.js source to inline instead of loading a URL (offline renderers). Use the vendored copy:
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
  /** Row-count check (only with stableTablePagination, else null) */
  validation: {
    source: number;
    printed: number;
    missing: string[];
    clipped: string[];
    misaligned: string[];
    ok: boolean;
  } | null;
}

/** Build the complete paginated HTML document (the one `pagify.render()` mounts in its iframe). */
export function buildIframeHTML(options?: BuildIframeHTMLOptions): string;

/** CSS that prints "Page N of M" before the given selector ("" when no selector) */
export function buildPageNumberCSS(page_number_selector?: string): string;

/** Paged.js URL the browser SDK loads by default */
export const DEFAULT_PAGEDJS_URL: string;

/** Absolute path of the vendored Paged.js 0.4.3 polyfill (Node only; null in the browser) */
export const PAGEDJS_POLYFILL_PATH: string | null;
