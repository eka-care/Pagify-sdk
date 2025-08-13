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
