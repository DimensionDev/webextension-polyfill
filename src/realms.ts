import Realm from 'realms-shim'
import { transformAST, scriptTransformCache } from './transformers'
// See: https://github.com/systemjs/systemjs/issues/2123
import 'systemjs'
import 'systemjs/dist/s.js'
import { checkDynamicImport } from './transformers/has-dynamic-import'
const SystemJSConstructor: { new (): typeof System } & typeof System = System.constructor as any
Reflect.deleteProperty(globalThis, 'System')
export type ModuleKind = 'module' | 'script'
export abstract class SystemJSRealm extends SystemJSConstructor {
    /** Fetch the file that the SystemJSRealm requires for module loading */
    protected abstract async fetchPrebuilt(
        kind: ModuleKind,
        url: string,
    ): Promise<{ content: string; asSystemJS: boolean } | null>
    protected abstract async fetchSourceText(url: string): Promise<string | null>
    readonly [Symbol.toStringTag] = 'Realm'
    //#region System
    /** Create import.meta */
    protected createContext(url: string): object {
        if (url.startsWith('script:')) return this.global.eval('({ url: undefined })')
        return this.global.JSON.parse(JSON.stringify({ url }))
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
    private inlineModule = new Map<string, string>()
    resolve(url: string, parentUrl: string): string {
        if (this.inlineModule.has(url)) return url
        if (this.inlineModule.has(parentUrl)) parentUrl = this.global.location.href
        return new URL(url, parentUrl).toJSON()
    }

    protected async instantiate(url: string) {
        const evalSourceText = (sourceText: string, src: string, prebuilt: boolean) => {
            const opt = prebuilt ? {} : { transforms: [this.runtimeTransformer('module', src)] }
            const result = this.esRealm.evaluate(sourceText, {}, opt)
            const executor = result as (System: this) => void
            executor(this)
        }
        if (this.inlineModule.has(url)) {
            const sourceText = this.inlineModule.get(url)!
            evalSourceText(sourceText, url, false)
            return this.getRegister()
        }

        const prebuilt = await this.fetchPrebuilt('module', url)
        if (prebuilt) {
            const { content } = prebuilt
            evalSourceText(content, url, true)
        } else {
            const code = await this.fetchSourceText(url)
            if (!code) throw new TypeError(`Failed to fetch dynamically imported module: ` + url)
            evalSourceText(code, url, false)
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
    private runtimeTransformer = (kind: ModuleKind, fileName: string) => ({
        rewrite: (ctx: { src: string }) => {
            ctx.src = transformAST(ctx.src, kind, fileName)
            return ctx
        },
    })
    protected esRealm = Realm.makeRootRealm({
        sloppyGlobals: true,
        transforms: [],
    })
    private id = 0
    private getEvalFileName() {
        return `debugger://${this.global.browser.runtime.id}/VM${++this.id}`
    }
    get global(): typeof globalThis & { browser: typeof browser } {
        return this.esRealm.global
    }
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
            const executeResult = this.esRealm.evaluate(content) as (System: this) => void
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
     */
    async evaluateInlineModule(sourceText: string) {
        const key = `script:` + Math.random().toString()
        this.inlineModule.set(key, sourceText)
        try {
            return await this.import(key)
        } finally {
            this.inlineModule.delete(key)
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
     */
    evaluateInlineScript(sourceText: string, scriptURL: string = this.getEvalFileName()) {
        const hasCache = scriptTransformCache.has(sourceText)
        const cache = scriptTransformCache.get(sourceText)
        const transformer = { transforms: [this.runtimeTransformer('script', scriptURL)] }
        if (!checkDynamicImport(sourceText)) {
            if (hasCache) return this.esRealm.evaluate(cache!)
            return this.esRealm.evaluate(sourceText, {}, transformer)
        }
        const executor = (hasCache
            ? this.esRealm.evaluate(cache!)
            : this.esRealm.evaluate(sourceText, {}, transformer)) as (System: this) => void
        return this.invokeScriptKindSystemJSModule(executor, scriptURL)
    }
    //#endregion
}
