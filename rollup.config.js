import typescript from 'rollup-plugin-typescript2'
import commonjs from 'rollup-plugin-commonjs'
import nodeResolve from 'rollup-plugin-node-resolve'
import * as Rollup from 'rollup'

import fs from 'fs'
import uglify from 'uglify-es'

const alwaysThrowRequire = 'new Symbol()'
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
if (!fs.existsSync('./dist/realm.js')) {
    let realmSourceCode = fs.readFileSync('./node_modules/realms-shim/dist/realms-shim.umd.js', 'utf-8')
    realmSourceCode = realmSourceCode.replace(/require\(.+?\)/g, alwaysThrowRequire)
    realmSourceCode = realmSourceCode.replace(/typeof (exports|module|define)/g, '"undefined"')

    // Hack. Related links:
    // https://github.com/DimensionDev/realms-shim/commit/55963b0b26c92235123afb0a95c251e0f48fd59d
    // https://bugs.webkit.org/show_bug.cgi?id=195534
    realmSourceCode = realmSourceCode.replace('const alwaysThrowHandler =', 'const alwaysThrowHandler = freeze({});')

    // Hack. Related links:
    // https://github.com/Agoric/realms-shim/commit/969f1fe83d764d170292668a73a98eb33cd506ab
    // https://github.com/Agoric/realms-shim/issues/52
    realmSourceCode = realmSourceCode.replace(
        `const FunctionPrototype = getPrototypeOf(FunctionInstance);

      // Prevents the evaluation of source when calling constructor on the
      // prototype of functions.
      const TamedFunction = function() {
        throw new TypeError('Not available');
      };`,
        `const oldFunctionConstructor = FunctionPrototype.constructor;
function isRunningInRealms() {
  const e = new Error().stack;
  if (!e) return true;
  return e.indexOf('eval') !== -1;
}
// Prevents the evaluation of source when calling constructor on the
// prototype of functions.
const TamedFunction = function() {
  if (isRunningInRealms()) {
    throw new TypeError('Not available');
  } else {
    return oldFunctionConstructor.apply(this, arguments);
  }
};`,
    )

    // const realm = uglify.minify(realmSourceCode, { compress: true })
    console.log('Writing realm')
    // if (realm.error) throw realm.error
    fs.writeFileSync('./dist/realm.js', realmSourceCode)
}

const ignore = ['vm', '@microsoft/typescript-etw', 'fs', 'path', 'os', 'crypto', 'buffer', 'source-map-support']

// const isDev = process.argv.join(' ').indexOf('-w') !== -1

/** @type {Rollup.RollupOptions} */
const config = {
    input: './src/index.ts',
    output: {
        file: './dist/out.js',
        format: 'iife',
        sourcemap: false,
    },
    // bundle a typescript is slow and hard to debug
    external: ['typescript', 'realms-shim'],
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
            ignore: ignore,
            sourceMap: true,
        }),
    ],
}

export default config
