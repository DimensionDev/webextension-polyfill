import typescript from 'rollup-plugin-typescript2'
import nodeResolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import * as Rollup from 'rollup'

import fs from 'fs'
import uglify from 'uglify-es'

const alwaysThrowRequire = 'Symbol()'
if (!fs.existsSync('./dist')) fs.mkdirSync('./dist')
if (!fs.existsSync('./dist/typescript.js')) {
    let typescriptSourceCode = fs.readFileSync(require.resolve('typescript'), 'utf-8')
    typescriptSourceCode = typescriptSourceCode.replace(/require\(.+?\)/g, alwaysThrowRequire)
    typescriptSourceCode = typescriptSourceCode.replace(/typeof module !== "undefined"/g, 'false')
    typescriptSourceCode = typescriptSourceCode.replace(/typeof (process|ChakraHost|require)/g, '"undefined"')

    const ts = uglify.minify(typescriptSourceCode, { compress: true })
    console.log('Writing typescript')
    if (ts.error) throw ts.error
    fs.writeFileSync('./dist/typescript.js', ts.code)
}

const ignore = ['vm', '@microsoft/typescript-etw', 'fs', 'path', 'os', 'crypto', 'buffer', 'source-map-support']

// const isDev = process.argv.join(' ').indexOf('-w') !== -1

/** @type {Rollup.RollupOptions} */
const config = {
    input: './src/index.ts',
    output: {
        file: './dist/out.js',
        format: 'iife',
        sourcemap: true,
    },
    // bundle a typescript is slow and hard to debug
    external: ['typescript'],
    plugins: [
        nodeResolve({
            browser: true,
            preferBuiltins: false,
            mainFields: ['module', 'main'],
        }),
        typescript({ tsconfigOverride: { compilerOptions: { module: 'ESNext' } } }),
        commonjs({
            extensions: ['.js', '.ts', '.tsx'],
            exclude: ['node_modules/lodash-es/'],
            ignore: ignore,
            sourceMap: true,
        }),
    ],
}

export default config
