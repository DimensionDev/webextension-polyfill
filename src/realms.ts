import Realm from 'realms-shim'
import { transformAST } from './transformers'
// See: https://github.com/systemjs/systemjs/issues/2123
import 'systemjs'
import 'systemjs/dist/s.js'
import { checkDynamicImport } from './transformers/has-dynamic-import'
const SystemJSConstructor: { new (): typeof System } & typeof System = System.constructor as any
Reflect.deleteProperty(globalThis, 'System')
type ModuleKind = 'module' | 'script'
export abstract class SystemJSRealm extends SystemJSConstructor {
    /** Fetch the file that the SystemJSRealm requires for module loading */
    protected abstract async fetch(...args: Parameters<typeof fetch>): Promise<Response>
    readonly [Symbol.toStringTag] = 'Realm'
    //#region System
    /** Create import.meta */
    protected createContext(url: string): object {
        if (url.startsWith('script:')) return this.global.eval('{ url: undefined }')
        return this.global.JSON.parse(JSON.stringify({ url }))
    }
    protected createScript() {
        throw new Error('Invalid call')
    }
    protected async prepareImport() {}
    private temporaryModule = new Map<string, [ModuleKind, string]>()
    resolve(url: string, parentUrl: string): string {
        if (this.temporaryModule.has(url)) return url
        if (this.temporaryModule.has(parentUrl)) parentUrl = this.global.location.href
        return new URL(url, parentUrl).toJSON()
    }
    protected async instantiate(url: string, parentUrl: string) {
        if (this.temporaryModule.has(url)) {
            const [kind, sourceText] = this.temporaryModule.get(url)!
            this.runExecutor(sourceText, kind)
            return this.getRegister()
        }
        const code = await this.loadFile(url, parentUrl)
        this.runExecutor(code, this.isNextScript ? 'script' : 'module')
        this.sourceSrc.delete(url)
        // ? The executor should call the register exactly once.
        return this.getRegister()
    }
    private async loadFile(url: string, parentUrl: string) {
        // actually it will return a Promise
        const resolved = await this.resolve(url, parentUrl)
        const req = await this.fetch(resolved)
        if (!req.ok) throw new TypeError(`Failed to fetch dynamically imported module: ` + url)
        const code = await req.text()
        this.sourceSrc.set(code, resolved)
        return code
    }
    protected lastModuleRegister: readonly [string[], Function] | null = null
    protected getRegister(): readonly [string[], Function] {
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
    protected esRealm = Realm.makeRootRealm({
        sloppyGlobals: true,
        transforms: [
            {
                rewrite: ctx => {
                    if (!this.inited) return ctx
                    ctx.src = transformAST(
                        ctx.src,
                        this.isNextScript ? 'script' : 'module',
                        this.sourceSrc.get(ctx.src) || this.getEvalFileName(),
                    )
                    this.isNextScript = false
                    return ctx
                },
            },
        ],
    })
    private id = 0
    private getEvalFileName() {
        return `debugger://${this.global.browser.runtime.id}/VM${++this.id}`
    }
    /**
     * Realms have it's own code to execute.
     */
    private inited = false
    constructor() {
        super()
        this.inited = true
    }
    get global(): typeof globalThis & { browser: typeof browser } {
        return this.esRealm.global
    }
    private isNextScript = false
    private sourceSrc = new Map<string, string>()
    async evaluateScript(path: string, parentUrl: string): Promise<unknown> {
        this.isNextScript = true
        const sourceText = await this.loadFile(path, parentUrl)

        if (!checkDynamicImport(sourceText)) {
            return this.esRealm.evaluate(sourceText)
        }
        return await this.import(path, parentUrl)
    }
    async evaluateModule(path: string, parentUrl: string) {
        this.isNextScript = false
        return this.import(path, parentUrl)
    }
    async evaluateInlineModule(sourceText: string, sourceMapURL?: string) {
        this.isNextScript = false
        return this.evaluateInlineTreatAsModule(sourceText, sourceMapURL)
    }
    evaluateInlineScript(sourceText: string, sourceURL?: string) {
        this.isNextScript = true
        if (!checkDynamicImport(sourceText)) {
            sourceURL && this.sourceSrc.set(sourceText, this.esRealm.global.browser.runtime.getURL(sourceURL))
            return this.esRealm.evaluate(sourceText)
        }
        this.evaluateInlineTreatAsModule(sourceText, sourceURL)
        // TODO: should return a Promise.
    }
    private async evaluateInlineTreatAsModule(sourceText: string, sourceMapURL?: string) {
        if (sourceMapURL) this.sourceSrc.set(sourceText, this.esRealm.global.browser.runtime.getURL(sourceMapURL))
        const key = `script:` + Math.random().toString()
        this.temporaryModule.set(key, [this.isNextScript ? 'script' : 'module', sourceText])
        try {
            return await this.import(key)
        } finally {
            this.temporaryModule.delete(key)
            this.delete?.(key)
        }
    }
    private runExecutor(sourceText: string, kind: ModuleKind): void {
        const executor = this.esRealm.evaluate(sourceText) as (System: this) => void
        if (!checkDynamicImport(sourceText) && kind === 'script') {
            this.lastModuleRegister = [
                [],
                function(_: any, __: any) {
                    return {
                        setters: [],
                        execute: function() {},
                    }
                },
            ]
        } else executor(this)
    }
    //#endregion
}
