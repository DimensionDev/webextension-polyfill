function static_eval_generated() {
    // @ts-ignore
    const value = (function () {
        if (arguments[0]) {
            return function () {
                // prettier-ignore
                const { browser, Infinity, NaN, undefined, isFinite, isNaN, parseFloat, parseInt, decodeURI, decodeURIComponent, encodeURI, encodeURIComponent, Array, ArrayBuffer, Boolean, DataView, EvalError, Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, Map, Number, Object, RangeError, ReferenceError, Set, String, Symbol, SyntaxError, TypeError, Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array, URIError,WeakMap, WeakSet, JSON, Math, Reflect, escape, unescape, top, window, self } = globalThis
                throw ''
            }.call(undefined)
        }
        // @ts-ignore
    })(getProxy())
    function getProxy() {
        const { get, set } = Reflect
        const currentExtensionGlobal = Symbol.for('GLOBAL_SCOPE')
        const global = get(globalThis, currentExtensionGlobal)
        return new Proxy(
            { __proto__: null },
            {
                get(shadow, prop) {
                    if (typeof prop === 'symbol') {
                        return undefined
                    }
                    return get(global, prop)
                },
                set: (shadow, prop, value) => set(global, prop, value),
                has: () => true,
                getPrototypeOf: () => null,
            },
        )
    }
    // Async eval completion
    // @ts-ignore
    globalThis[Symbol.for('CALLBACK_HERE')]?.(value)
    // sync eval completion
    return value
}
export function generateEvalString(code: string, globalScopeSymbol: symbol, callbackSymbol: symbol) {
    let x = static_eval_generated.toString()
    x = replace(x, 'if (arguments[0])', 'with (arguments[0])')
    x = replace(x, 'GLOBAL_SCOPE', globalScopeSymbol.description!)
    x = replace(x, 'CALLBACK_HERE', callbackSymbol.description!)
    x = replace(x, `throw ''`, code + '\n') + ';' + static_eval_generated.name.toString() + '()'
    return x
}

function replace(x: string, y: string, z: string) {
    const pos = x.indexOf(y)
    return x.slice(0, pos) + z + x.slice(pos + y.length)
}
