import Realm, { Realm as RealmInstance } from 'realms-shim'
import { transformAST } from './transformers'
// See: https://github.com/systemjs/systemjs/issues/2123
import 'systemjs'
import 'systemjs/dist/s.js'
const SystemJSConstructor: { new (): typeof System } & typeof System = System.constructor as any
Reflect.deleteProperty(globalThis, 'System')

export abstract class SystemJSRealm extends SystemJSConstructor implements RealmInstance {
    /** Run after the realms is ready */
    protected abstract init(): void
    /** Fetch the file that the SystemJSRealm requires for module loading */
    protected abstract async fetch(...args: Parameters<typeof fetch>): Promise<Response>
    readonly [Symbol.toStringTag] = 'Realm'
    //#region System
    /** Create import.meta */
    protected createContext(url: string): object {
        return { url }
    }
    protected createScript() {
        throw new Error('Invalid call')
    }
    protected async prepareImport() {}
    protected async instantiate(url: string, parentUrl: string) {
        // for unknown reason it may return a Promise
        const resolved = await this.resolve(url, parentUrl)
        const code = await this.fetch(resolved).then(x => x.text())
        this.evaluateModule(code)
        // ? The executor should call the register exactly once.
        return this.getRegister()
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
                    ctx.src = transformAST(ctx.src, this.isMod ? 'module' : 'script')
                    this.isMod = false
                    return ctx
                },
            },
        ],
    })
    /**
     * Realms have it's own code to execute.
     */
    private inited = false
    constructor() {
        super()
        this.init()
        this.inited = true
    }
    get global(): typeof globalThis & { browser: typeof browser } {
        return this.esRealm.global
    }
    evaluate(sourceText: string) {
        return this.eval(sourceText)
    }
    private isMod = false
    private evaluateModule(sourceText: string) {
        this.isMod = true
        return this.eval(sourceText)
    }
    private eval(sourceText: string) {
        const executor = this.esRealm.evaluate(sourceText) as (System: this) => void
        return executor(this)
    }
    //#endregion
}
