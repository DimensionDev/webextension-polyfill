import typescript from 'rollup-plugin-typescript2'
import commonjs from 'rollup-plugin-commonjs'
import nodeResolve from 'rollup-plugin-node-resolve'

const config = {
    input: './src/index.ts',
    output: {
        file: './dist/out.js',
        format: 'umd',
        name: 'HoloflowsKit',
    },
    plugins: [
        nodeResolve({
            browser: true,
            preferBuiltins: false,
            mainFields: ['module', 'main'],
        }),
        typescript({ tsconfigOverride: { compilerOptions: { target: 'es6' } } }),
        commonjs({
            extensions: ['.js', '.ts', '.tsx'],
            exclude: ['node_modules/lodash-es/'],
            namedExports: {
                'node_modules/@holoflows/kit/node_modules/events/events.js': ['EventEmitter'],
            },
            ignore: ['vm'],
        }),
    ],
}

export default config
