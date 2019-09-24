import typescript from 'rollup-plugin-typescript2'
import commonjs from 'rollup-plugin-commonjs'
import nodeResolve from 'rollup-plugin-node-resolve'
import { string } from 'rollup-plugin-string'
import * as Rollup from 'rollup'

/** @type {Rollup.RollupOptions} */
const config = {
    input: './src/index.ts',
    output: {
        file: './dist/out.js',
        format: 'iife',
        sourcemap: 'inline',
    },
    plugins: [
        nodeResolve({
            browser: true,
            preferBuiltins: false,
            mainFields: ['module', 'main'],
        }),
        typescript(),
        commonjs({
            extensions: ['.js', '.ts', '.tsx'],
            exclude: ['node_modules/lodash-es/'],
            namedExports: {
                'node_modules/@holoflows/kit/node_modules/events/events.js': ['EventEmitter'],
            },
            ignore: ['vm', '@microsoft/typescript-etw', 'fs', 'path', 'os', 'crypto', 'buffer', 'source-map-support'],
            sourceMap: true,
        }),
    ],
}

export default config
