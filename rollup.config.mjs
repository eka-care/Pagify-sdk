import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';
import json from '@rollup/plugin-json';
import replace from '@rollup/plugin-replace';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

// Read dependency bundles at build time so standalone build can inline them
// into iframe srcdoc instead of fetching from unpkg.com at runtime.
const pagedJsContent = readFileSync(
    join(__dirname, 'node_modules/pagedjs/dist/paged.polyfill.js'), 'utf-8'
);
const html2pdfContent = readFileSync(
    join(__dirname, 'node_modules/html2pdf.js/dist/html2pdf.bundle.min.js'), 'utf-8'
);

// For non-standalone builds: content placeholders are null, standalone flag is false.
// Terser constant-folds the boolean and eliminates the CDN fallback dead-code paths.
const replaceNullDeps = replace({
    preventAssignment: true,
    __PAGIFY_STANDALONE__: JSON.stringify(false),
    __PAGIFY_PAGEDJS_CONTENT__: 'null',
    __PAGIFY_HTML2PDF_CONTENT__: 'null',
});

// For standalone build: content strings are inlined, standalone flag is true.
const replaceInlinedDeps = replace({
    preventAssignment: true,
    __PAGIFY_STANDALONE__: JSON.stringify(true),
    __PAGIFY_PAGEDJS_CONTENT__: JSON.stringify(pagedJsContent),
    __PAGIFY_HTML2PDF_CONTENT__: JSON.stringify(html2pdfContent),
});

export default [
    // ES Module build
    {
        input: 'pagify.js',
        output: {
            file: 'dist/pagify.esm.js',
            format: 'es',
            sourcemap: true
        },
        plugins: [
            replaceNullDeps,
            nodeResolve({
                browser: true,
                preferBuiltins: false
            }),
            commonjs(),
            babel({
                babelHelpers: 'bundled',
                exclude: 'node_modules/**',
                presets: [
                    ['@babel/preset-env', {
                        targets: {
                            browsers: ['> 1%', 'last 2 versions', 'not dead']
                        },
                        modules: false
                    }]
                ]
            }),
            isProduction && terser()
        ].filter(Boolean),
        external: ['pagedjs', 'html2pdf.js']
    },

    // UMD build for browsers
    {
        input: 'pagify.js',
        output: {
            file: 'dist/pagify.js',
            format: 'umd',
            name: 'Pagify',
            exports: 'named',
            sourcemap: true,
            globals: {
                'pagedjs': 'PagedJS',
                'html2pdf.js': 'html2pdf'
            }
        },
        plugins: [
            replaceNullDeps,
            nodeResolve({
                browser: true,
                preferBuiltins: false
            }),
            commonjs(),
            babel({
                babelHelpers: 'bundled',
                exclude: 'node_modules/**',
                presets: [
                    ['@babel/preset-env', {
                        targets: {
                            browsers: ['> 1%', 'last 2 versions', 'not dead']
                        },
                        modules: false
                    }]
                ]
            }),
            isProduction && terser()
        ].filter(Boolean),
        external: ['pagedjs', 'html2pdf.js']
    },

    // Standalone build — all dependencies inlined, zero runtime CDN fetches.
    {
        input: 'pagify.js',
        output: {
            file: 'dist/pagify.standalone.js',
            format: 'umd',
            name: 'Pagify',
            exports: 'named',
            sourcemap: true,
            inlineDynamicImports: true
        },
        plugins: [
            replaceInlinedDeps,
            nodeResolve({
                browser: true,
                preferBuiltins: false
            }),
            commonjs(),
            json(),
            babel({
                babelHelpers: 'bundled',
                exclude: 'node_modules/**',
                presets: [
                    ['@babel/preset-env', {
                        targets: {
                            browsers: ['> 1%', 'last 2 versions', 'not dead']
                        },
                        modules: false
                    }]
                ]
            }),
            isProduction && terser()
        ].filter(Boolean)
    }
];
