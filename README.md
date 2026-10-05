# Pagify SDK

A powerful JavaScript SDK for rendering HTML content as paginated PDFs using Paged.js and html2pdf.js. Perfect for generating reports, invoices, documentation, and any print-ready content in the browser.

## 🚀 Live Demo

Try the interactive demo: **[https://eka-care.github.io/Pagify-sdk/](https://eka-care.github.io/Pagify-sdk/)**

## Features

- ✨ **Client-side PDF generation** - No server dependencies
- 📄 **Professional pagination** - Powered by Paged.js
- 🎨 **Rich styling support** - CSS @page rules, headers, footers
- 🖼️ **Base64 image support** - Offline-compatible image handling
- 📱 **Cross-platform** - Works on desktop and mobile browsers
- 🔧 **Easy integration** - Simple API with TypeScript support
- 👁️ **Preview mode** - View paginated layout without generating PDF
- 🧹 **Automatic cleanup** - Prevents memory leaks from zombie iframes

## Installation

```bash
npm install @eka-care/pagify-sdk
```

Or via CDN:

```html
<script src="https://unpkg.com/@eka-care/pagify-sdk/dist/pagify.standalone.js"></script>
```

## Quick Start

### ES Modules

```javascript
import pagify from '@eka-care/pagify-sdk';

// Generate a PDF
await pagify.render({
    body_html: '<h1>Hello World!</h1><p>This is my first PDF.</p>',
    header_html: '<div>Page Header</div>',
    footer_html: '<div>Page <span class="pageNumber"></span></div>',
    onPdfReady: (blobUrl) => {
        // Display PDF in iframe or create download link
        document.getElementById('pdf-viewer').src = blobUrl;
    },
    onPdfError: (error) => {
        console.error('PDF generation failed:', error);
    }
});
```

### Browser (UMD)

```html
<script src="https://unpkg.com/@eka-care/pagify-sdk/dist/pagify.standalone.js"></script>
<script>
    window.pagify.render({
        body_html: '<h1>Hello World!</h1>',
        onPdfReady: (blobUrl) => {
            window.open(blobUrl, '_blank');
        }
    });
</script>
```

### Preview Mode

```javascript
// Show preview without generating PDF (faster)
await pagify.render({
    body_html: '<h1>Preview Content</h1>',
    containerSelector: '#preview-container',
    isViewOnlySkipMakingPDF: true,
    onPreviewReady: (result) => {
        if (result.success) {
            console.log('Preview ready');
        }
    }
});
```

## API Reference

### `pagify.render(options)`

Renders HTML content as a paginated PDF.

#### Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `body_html` | `string` | `""` | Main HTML content for the PDF body |
| `header_html` | `string` | `""` | HTML content for page headers |
| `footer_html` | `string` | `""` | HTML content for page footers |
| `head_html` | `string` | `""` | Additional HTML for the `<head>` section |
| `page_size` | `string` | `"A4"` | Page size (A4, Letter, etc.) |
| `margin_left` | `string` | `"0mm"` | Left page margin |
| `margin_right` | `string` | `"0mm"` | Right page margin |
| `header_height` | `string` | `"0mm"` | Height reserved for header |
| `footer_height` | `string` | `"0mm"` | Height reserved for footer |
| `containerSelector` | `string` | `null` | CSS selector for preview container |
| `isViewOnlySkipMakingPDF` | `boolean` | `false` | If true, only renders preview without generating PDF |
| `onPdfReady` | `function` | `null` | Callback when PDF is ready (receives blobUrl) |
| `onPdfError` | `function` | `null` | Callback when PDF generation fails (receives error) |
| `onPreviewReady` | `function` | `null` | Callback when preview completes (receives {success, error?}) |
| `stableTablePagination` | `boolean` | `false` | Paginate with Eka's Paged.js fork, which never loses table rows — see [Stable table pagination](#stable-table-pagination) |
| `onPaginationValidation` | `function` | `null` | With `stableTablePagination`: called once pagination finishes with the row check `{ source, printed, missing, clipped, ok }` |

#### Example with Advanced Styling

```javascript
await pagify.render({
    head_html: `
        <style>
            @page {
                size: A4;
                margin: 25mm 20mm;
            }
            body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
            }
            .page-break {
                page-break-before: always;
            }
        </style>
    `,
    header_html: `
        <div style="text-align: center; font-size: 12px;">
            Document Header - Page <span class="pageNumber"></span>
        </div>
    `,
    body_html: `
        <h1>Professional Report</h1>
        <p>This demonstrates advanced PDF generation capabilities.</p>
        
        <table>
            <tr><th>Item</th><th>Value</th></tr>
            <tr><td>Revenue</td><td>$100,000</td></tr>
            <tr><td>Profit</td><td>$25,000</td></tr>
        </table>
        
        <div class="page-break"></div>
        <h2>Page 2 Content</h2>
        <p>This content appears on the second page.</p>
    `,
    footer_html: `
        <div style="text-align: center; font-size: 10px;">
            © 2024 Company Name | Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
    `,
    header_height: "15mm",
    footer_height: "15mm",
    onPdfReady: (blobUrl) => {
        // Create download link
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = 'report.pdf';
        link.textContent = 'Download PDF';
        document.body.appendChild(link);
    }
});
```

#### Example with Preview Mode

```javascript
// Step 1: Show only preview and do not make PDF
await pagify.render({
    body_html: '<h1>Invoice #12345</h1>',
    header_html: '<div>Company Header</div>',
    footer_html: '<div>Page <span class="pageNumber"></span></div>',
    containerSelector: '#preview-container',
    isViewOnlySkipMakingPDF: true,
    onPreviewReady: ({ success, error }) => {
        if (success) {
            // caller/invoker/application layer does their flows
        } else {
            console.error('Preview failed:', error);
        }
    }
});


document.getElementById('download-btn').onclick = async () => {
    await pagify.render({
        body_html: '<h1>Invoice #12345</h1>',
        header_html: '<div>Company Header</div>',
        footer_html: '<div>Page <span class="pageNumber"></span></div>',
        // isViewOnlySkipMakingPDF: true, --> not passing this makes the PDF and the cb to watch for is onPdfReady when this is not passed and when its passed  onPreviewReady. 
        onPdfReady: (blobUrl) => {
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = 'invoice.pdf';
            link.click();
        }
    });
};
```

### `pagify.generatePDF(options)`

Direct PDF generation that returns a Promise with the PDF blob.

```javascript
try {
    const pdfBlob = await pagify.generatePDF({
        body_html: '<h1>Direct PDF Generation</h1>',
        header_html: '<div>Header</div>'
    });
    
    // Use the blob directly
    const url = URL.createObjectURL(pdfBlob);
    window.open(url, '_blank');
} catch (error) {
    console.error('PDF generation failed:', error);
}
```

## CSS Styling Guide

### Page Layout

```css
@page {
    size: A4 portrait;
    margin: 25mm 20mm;
}
```

### Headers and Footers

Use `pageNumber` and `totalPages` classes for dynamic content:

```html
<div class="footer">
    Page <span class="pageNumber"></span> of <span class="totalPages"></span>
</div>
```

### Page Breaks

```css
.page-break-before { page-break-before: always; }
.page-break-after { page-break-after: always; }
.page-break-avoid { page-break-inside: avoid; }
```

### Stable table pagination

Stock Paged.js 0.4.3 can drop table rows from the printed output with no error: a row that doesn't
fit stays in the DOM but sits in Paged.js's hidden overflow area, so the PDF is simply short. It also
doesn't repeat `<thead>` on continued pages, and a row taller than a page (under
`tr { break-inside: avoid }`) stops pagination and truncates the document.

`stableTablePagination: true` (opt-in, off by default for a gradual rollout) paginates with
**[Eka's fork of Paged.js 0.4.3](https://github.com/eka-care/pagedjs)** (`v0.4.3-eka.1`), which fixes
this in Paged.js itself:

- `<thead>` and `<colgroup>` repeat on every page a table continues onto, as part of what the page
  measures, so no row is pushed out of print;
- rows stay whole when they fit; a row taller than a page breaks across pages instead of truncating
  the document;
- rowspan cells close at page edges, and a header isn't left alone at the bottom of a page.

The fork ships in this package (`pagify-utils/paged.polyfill.js`); the browser loads it from this
package's own version on unpkg. With the fork, Pagify registers **no** table workaround: the legacy
after-layout header handler is not used. Tables with no body rows are still hidden, as before.

**Nothing silently disappears.** After pagination, Pagify also checks that every `<tbody>` row
(outside the running header/footer) is *visible* inside a page. Rows are reported by number (1 = the
first body row in the source), never by their content. The result is passed to
`onPaginationValidation`, dispatched as a `paginationValidation` window event, and logged
(`console.error` on failure). Use it to monitor production documents:

```javascript
pagify.render({
    body_html,
    stableTablePagination: true,
    onPaginationValidation: (result) => {
        // { source: 80, printed: 80, missing: [], clipped: [], ok: true }
        if (!result.ok) reportToMonitoring(result);
    },
    onPdfReady: (blobUrl) => { /* unchanged */ },
});
```

With the flag off or omitted, the generated document is byte-identical to 1.4.3 (stock Paged.js
0.4.3 and the legacy header handler); `test/builder.test.js` checks this against 1.4.3's own output.

### Base64 Images

For offline compatibility, use base64 encoded images:

```html
<img src="data:image/png;base64,iVBORw0KGgoAAAANS..." alt="Logo">
```

## Server-side rendering (pagify-utils)

The HTML document Pagify paginates is built in one place, `pagify-utils/` — plain CommonJS with zero
dependencies. The browser SDK uses it for its iframe; a server renderer (e.g. with Puppeteer) uses
the **same** builder, so pagination fixes land everywhere at once instead of in N copies.

```bash
npm install @eka-care/pagify-sdk@^1.5.0
```

```js
const { buildIframeHTML, PAGEDJS_POLYFILL_PATH } = require("@eka-care/pagify-sdk/pagify-utils");

const html = buildIframeHTML({
    body_html,
    isViewOnlySkipMakingPDF: true,                                // Puppeteer makes the PDF
    pagedjs_inline: fs.readFileSync(PAGEDJS_POLYFILL_PATH, "utf8"), // no network
    completionCallbackName: "onPagifyRendered",                   // page.exposeFunction(...)
    stableTablePagination: true,
});
```

**Full guide: [docs/server-side-rendering.md](docs/server-side-rendering.md)** — the Puppeteer flow,
loading Paged.js and the "rendering complete" event in the browser vs on the server, the row check
payload, every option, production notes and troubleshooting.

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Dependencies

None at install time. The rendering iframe loads its libraries itself:

- [Paged.js](https://pagedjs.org/) - CSS paged media polyfill: stock 0.4.3 from unpkg by default;
  with `stableTablePagination`, [Eka's fork](https://github.com/eka-care/pagedjs) shipped in
  `pagify-utils/paged.polyfill.js` (override with `pagedjs_url` / `pagedjs_inline`)
- [html2pdf.js](https://github.com/eKoopmans/html2pdf.js) - HTML to PDF conversion (from unpkg, PDF mode only)

## TypeScript Support

Full TypeScript definitions included:

```typescript
import pagify, { PagifyOptions, PagifySDK } from '@eka-care/pagify-sdk';

const options: PagifyOptions = {
    body_html: '<h1>TypeScript Support</h1>',
    onPdfReady: (blobUrl: string) => {
        console.log('PDF ready:', blobUrl);
    }
};

await pagify.render(options);
```

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Watch mode for development
npm run dev

# Run linting
npm run lint

# Run tests
npm test
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

- 📖 [Documentation](https://github.com/eka-care/pagify)
- 🐛 [Issue Tracker](https://github.com/eka-care/pagify/issues)
- 💬 [Discussions](https://github.com/eka-care/pagify/discussions)