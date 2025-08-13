import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';
import json from '@rollup/plugin-json';

const isProduction = process.env.NODE_ENV === 'production';

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

    // Standalone build with dependencies bundled
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
