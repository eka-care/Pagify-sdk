/**
 * @jest-environment node
 */
// pagify-utils: the HTML document Pagify paginates, in the browser and on servers.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const utils = require('../pagify-utils/index.js');

// Outputs of 1.4.3's own builder (main before pagify-utils existed), for representative options.
const GOLDEN = path.join(__dirname, 'golden');
const goldens = fs.readdirSync(GOLDEN).filter((f) => f.endsWith('.json'))
    .map((f) => [f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(GOLDEN, f), 'utf8'))]);

describe('stableTablePagination off (the default)', () => {
    test.each(goldens)('%s: byte-identical to 1.4.3', (name, { options, html }) => {
        expect(utils.buildIframeHTML(options)).toBe(html);
    });

    test('loads stock Paged.js 0.4.3 and keeps the legacy table handler', () => {
        const html = utils.buildIframeHTML({ body_html: '<p>x</p>' });
        expect(html).toContain(`<script src="${utils.DEFAULT_PAGEDJS_URL}"`);
        expect(html).toContain('registerHandlers(RepeatingTableHeaders)');
        expect(html).not.toContain('pagifyValidateRows');
    });
});

describe('stableTablePagination on', () => {
    const html = utils.buildIframeHTML({ body_html: '<p>x</p>', stableTablePagination: true, instanceId: 'job-1' });

    test('loads Eka\'s Paged.js fork, not stock', () => {
        expect(html).toContain(`<script src="${utils.FORK_PAGEDJS_URL}"`);
        expect(html).not.toContain(utils.DEFAULT_PAGEDJS_URL);
    });

    test('drops the after-layout header repeat and the max-content override', () => {
        expect(html).not.toContain('RepeatingTableHeaders');
        expect(html).not.toContain('max-content');
        expect(html).toContain('registerHandlers(PagifyTables)');
    });

    test('keeps the CSS identical to the legacy mode', () => {
        const css = (s) => s.slice(s.indexOf('<style>'), s.indexOf('</style>'));
        expect(css(html)).toBe(css(utils.buildIframeHTML({ body_html: '<p>x</p>' })));
    });

    test('reports the row check to the host page by row number', () => {
        expect(html).toContain('type: "PAGINATION_VALIDATION"');
        expect(html).toContain('result: pagifyValidateRows()');
        expect(html).toContain('iter: "job-1"');
        // Rows are reported by number, never by their text: it may be patient data.
        const rowCheck = html.slice(html.indexOf('function pagifyBodyRows'), html.indexOf('registerHandlers(PagifyTables)'));
        expect(rowCheck).toContain('missing.push(n)');
        expect(rowCheck).not.toMatch(/textContent|innerText|innerHTML/);
    });
});

describe('Paged.js source', () => {
    test('an explicit pagedjs_url wins over the flag', () => {
        const url = 'https://cdn.example.test/paged.polyfill.js';
        expect(utils.buildIframeHTML({ stableTablePagination: true, pagedjs_url: url })).toContain(`<script src="${url}"`);
        expect(utils.buildIframeHTML({ pagedjs_url: url })).toContain(`<script src="${url}"`);
    });

    test('pagedjs_inline inlines the source and cannot close its <script> early', () => {
        const html = utils.buildIframeHTML({ pagedjs_inline: 'var a = "</script><b>";' });
        expect(html).toContain('<script>var a = "<\\/script><b>";</script>');
        expect(html).not.toContain('<script src=');
    });

    test('the fork URL serves this package version', () => {
        const pkg = require('../package.json');
        expect(utils.SDK_VERSION).toBe(pkg.version);
        expect(utils.FORK_PAGEDJS_URL).toBe(`https://unpkg.com/@eka-care/pagify-sdk@${pkg.version}/pagify-utils/paged.polyfill.js`);
        expect(pkg.files).toContain('pagify-utils');
    });

    test('the vendored polyfill is the fork release it names', () => {
        const source = fs.readFileSync(utils.PAGEDJS_POLYFILL_PATH);
        expect(source.toString('utf8', 0, 200)).toContain(`Paged.js v${utils.PAGEDJS_FORK_VERSION}`);
        // sha256 of paged.polyfill.js attached to https://github.com/eka-care/pagedjs/releases/tag/v0.4.3-eka.1
        expect(crypto.createHash('sha256').update(source).digest('hex'))
            .toBe('839ed65ebea9bf945b9cbf8d218fd982678b434b17bd1d8f9f5988d188c4641e');
    });
});

describe('completionCallbackName (headless drivers)', () => {
    test('calls the named global with { total, validation }', () => {
        const html = utils.buildIframeHTML({ stableTablePagination: true, completionCallbackName: 'onCustomEvent' });
        expect(html).toContain('var notify = window["onCustomEvent"]');
        expect(html).toContain('notify({ total: result.total, validation: window.__pagifyRowValidation || null })');
    });

    test('a hostile name cannot break out of the script', () => {
        const html = utils.buildIframeHTML({ completionCallbackName: '</script><script>alert(1)' });
        expect(html).not.toContain('</script><script>alert(1)');
    });
});
