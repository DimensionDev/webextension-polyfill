import { transformAST, scriptTransformCache } from './transformers'
// See: https://github.com/systemjs/systemjs/issues/2123
/// <reference lib="systemjs" />
import 'systemjs/dist/s.js'
import { checkDynamicImport } from './transformers/has-dynamic-import'
import { FrameworkRPC } from './RPCs/framework-rpc'
import { generateEvalString } from './static'
const SystemJSConstructor: { new (): typeof System } & typeof System = System.constructor as any
Reflect.deleteProperty(globalThis, 'System')
export type ModuleKind = 'module' | 'script'

const { set, construct, apply, deleteProperty } = Reflect
const { warn, trace } = console
export abstract class SystemJSRealm extends SystemJSConstructor implements Realm {
    //#region Realm
    readonly [Symbol.toStringTag] = 'Realm'
    readonly #globalScopeSymbol = Symbol.for(Math.random().toString())
    readonly #globalThis: typeof globalThis & { browser: typeof browser } = {
        __proto__: null,
        /**
         * Due to tech limitation, the eval will always be
         * PerformEval(code,
         *      callerRealm = this SystemJSRealm,
         *      strictCaller = false,
         *      direct = false)
         */
        eval: (code: unknown) => {
            // 18.2.1.1, step 2
            if (typeof code !== 'string') return code
            trace(`[WebExtension] Try to eval`, code)
            if (!checkDynamicImport(code))
                // Might be a Promise if the host enable CSP.
                return this.#evaluate(code, [this.#runtimeTransformer('script', 'prebuilt', false)])
            // Sadly, must return a Promise here.
            return this.evaluateInlineScript(code)
        },
        Function: new Proxy(Function, {
            construct: (target, argArray: any[], newTarget) => {
                trace('[WebExtension] try to call new Function the following code:', ...argArray)
                if (argArray.length === 1 && argArray[0] === 'return this') return () => this.globalThis
                // TODO: impl this
                throw new Error('Cannot run code dynamically')
                // return construct(target, argArray, newTarget)
            },
            apply: (target, thisArg, code: any[]) => {
                // Hack for babel regeneratorRuntime
                if (code.length === 1 && code[0] === 'return this') return () => this.globalThis
                if (code.length === 2 && code[0] === 'r' && code[1] === 'regeneratorRuntime = r')
                    // @ts-ignore
                    return (r: any) => (this.globalThis.regeneratorRuntime = r)
                warn('[WebExtension]: try to construct Function by the following code:', ...code)
                throw new Error('Cannot run code dynamically')
                // return apply(target, thisArg, code)
            },
        }),
    } as any
    get globalThis() {
        return this.#globalThis
    }
    // The import() function is implemented by SystemJS
    //#endregion
    constructor() {
        super()
        set(globalThis, this.#globalScopeSymbol, this.globalThis)
    }
    /** Fetch the file that the SystemJSRealm requires for module loading */
    protected abstract async fetchPrebuilt(
        kind: ModuleKind,
        url: string,
    ): Promise<{ content: string; asSystemJS: boolean } | null>
    protected abstract async fetchSourceText(url: string): Promise<string | null>
    //#region System
    /** Create import.meta */
    protected createContext(url: string): object {
        if (url.startsWith('script:')) return this.globalThis.JSON.parse(JSON.stringify({ url: null }))
        return this.globalThis.JSON.parse(JSON.stringify({ url }))
    }
    protected createScript() {
        throw new Error('Invalid call')
    }
    protected async prepareImport() {}
    /**
     * This is a map for inline module.
     * Key: script:random_number
     * Value: module text
     */
    readonly #inlineModule = new Map<string, string>()
    resolve(url: string, parentUrl: string): string {
        if (this.#inlineModule.has(url)) return url
        if (this.#inlineModule.has(parentUrl)) parentUrl = this.globalThis.location.href
        return new URL(url, parentUrl).toJSON()
    }

    protected async instantiate(url: string) {
        const evalSourceText = async (sourceText: string, src: string, prebuilt: boolean) => {
            const result = await this.#evaluate(sourceText, [this.#runtimeTransformer('module', src, prebuilt)])
            const executor = result as (System: this) => void
            executor(this)
        }
        if (this.#inlineModule.has(url)) {
            const sourceText = this.#inlineModule.get(url)!
            await evalSourceText(sourceText, url, false)
            return this.getRegister()
        }

        const prebuilt = await this.fetchPrebuilt('module', url)
        if (prebuilt) {
            const { content } = prebuilt
            await evalSourceText(content, url, true)
        } else {
            const code = await this.fetchSourceText(url)
            if (!code) throw new TypeError(`Failed to fetch dynamically imported module: ` + url)
            await evalSourceText(code, url, false)
            // ? The executor should call the register exactly once.
        }
        return this.getRegister()
    }
    protected lastModuleRegister: readonly [string[], System.DeclareFn] | null = null
    protected getRegister(): readonly [string[], System.DeclareFn] {
        return this.lastModuleRegister!
    }
    register(dependencies: string[], declare: System.DeclareFn): void
    // Unsupported overload
    register(name: string, dependencies: string[], declare: System.DeclareFn): void
    register(deps: string | string[], declare: string[] | System.DeclareFn, _?: System.DeclareFn): void {
        if (!Array.isArray(deps)) throw new TypeError()
        if (typeof declare !== 'function') throw new TypeError()
        this.lastModuleRegister = [deps, declare] as const
    }
    //#endregion
    //#region Realm
    #runtimeTransformer = (kind: ModuleKind, fileName: string, prebuilt: boolean) => (src: string) =>
        prebuilt ? src : transformAST(src, kind, fileName)
    #evaluate = (sourceText: string, transformer?: ((sourceText: string) => string)[]): unknown | Promise<unknown> => {
        const evalCallbackID = Symbol.for(Math.random().toString())
        let result = undefined
        let rejection = (e: Error) => {}
        const evaluation = new Promise<unknown>((resolve, reject) =>
            set(globalThis, evalCallbackID, (x: any) => {
                result = x
                resolve(x)
                rejection = reject
            }),
        )
        evaluation.finally(() => deleteProperty(globalThis, evalCallbackID))
        transformer?.forEach((f) => (sourceText = f(sourceText)))
        const evalString = generateEvalString(sourceText, this.#globalScopeSymbol, evalCallbackID)
        try {
            const _indirectEval = eval
            _indirectEval(evalString)
            return result
        } catch (e) {
            warn('Failed to eval sync: ', e)
        }
        setTimeout(rejection, 2000)
        return FrameworkRPC.eval('', evalString).then(
            () => evaluation,
            (e) => (rejection(e), evaluation),
        )
    }
    #id = 0
    #getEvalFileName = () => `debugger://${this.globalThis.browser.runtime.id}/VM${++this.#id}`
    /**
     * This function is used to execute script that with dynamic import
     * @param executor The SystemJS format executor returned by the eval call
     * @param scriptURL The script itself URL
     */
    private invokeScriptKindSystemJSModule(executor: (System: this) => void, scriptURL: string) {
        executor(this) // script mode with dynamic import
        const exportFn: System.ExportFn = () => {
            throw new SyntaxError(`Unexpected token 'export'`)
        }
        const context: System.Context = {
            import: (id, self) => this.import(id, self ?? scriptURL),
            get meta(): never {
                throw new SyntaxError(`Cannot use 'import.meta' outside a module`)
            },
        }
        return this.lastModuleRegister![1](exportFn, context).execute!()
    }
    async evaluateScript(path: string, parentUrl: string): Promise<unknown> {
        const scriptURL = await this.resolve(path, parentUrl)
        const prebuilt = await this.fetchPrebuilt('script', scriptURL)
        if (prebuilt) {
            const { asSystemJS, content } = prebuilt
            const executeResult = (await this.#evaluate(content)) as (System: this) => void
            if (!asSystemJS) return executeResult as unknown // script mode
            return this.invokeScriptKindSystemJSModule(executeResult, scriptURL)
        }

        const sourceText = await this.fetchSourceText(scriptURL)
        if (!sourceText) throw new Error('Failed to fetch script ' + scriptURL)

        return this.evaluateInlineScript(sourceText, scriptURL)
    }
    async evaluateModule(path: string, parentUrl: string) {
        return this.import(path, parentUrl)
    }
    /**
     * Evaluate a inline ECMAScript module
     * @param sourceText Source text
     *
     * @deprecated This method is not compatible with CSP and might be rejected by the host.
     */
    async evaluateInlineModule(sourceText: string) {
        const key = `script:` + Math.random().toString()
        this.#inlineModule.set(key, sourceText)
        try {
            return await this.import(key)
        } finally {
            this.#inlineModule.delete(key)
            this.delete?.(key)
        }
    }
    /**
     * This function will run code in ECMAScript Script parsing mode
     * which doesn't support static import/export or import.meta.
     *
     * But support dynamic import
     * @param sourceText Source code
     * @param scriptURL Script URL (optional)
     *
     * @deprecated This method is not compatible with CSP and might be rejected by the host.
     */
    async evaluateInlineScript(sourceText: string, scriptURL: string = this.#getEvalFileName()) {
        const hasCache = scriptTransformCache.has(sourceText)
        const cache = scriptTransformCache.get(sourceText)
        const transformer = [this.#runtimeTransformer('script', scriptURL, false)]
        if (!checkDynamicImport(sourceText)) {
            if (hasCache) return this.#evaluate(cache!)
            return this.#evaluate(sourceText, transformer)
        }
        const executor = (hasCache ? await this.#evaluate(cache!) : await this.#evaluate(sourceText, transformer)) as (
            System: this,
        ) => void
        return this.invokeScriptKindSystemJSModule(executor, scriptURL)
    }
    //#endregion
}
