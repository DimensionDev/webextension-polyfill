import RealmConstructor, { Realm } from 'realms-shim'

import { BrowserFactory } from './browser'
import { Manifest } from '../Extensions'
import { enhanceURL } from './URL.create+revokeObjectURL'

const staticGlobal = (() => {
    const realWindow = window
    const webAPIs = Object.getOwnPropertyDescriptors(window)
    Reflect.deleteProperty(webAPIs, 'window')
    Reflect.deleteProperty(webAPIs, 'globalThis')
    Reflect.deleteProperty(webAPIs, 'self')
    Reflect.deleteProperty(webAPIs, 'global')
    Object.defineProperty(Document.prototype, 'defaultView', {
        get() {
            return undefined
        },
    })
    return (sandboxRoot: typeof globalThis) => {
        const clonedWebAPIs = webAPIs
        Object.getOwnPropertyNames(sandboxRoot).forEach(name => Reflect.deleteProperty(clonedWebAPIs, name))
        for (const key in webAPIs) {
            const desc = webAPIs[key]
            const { get, set, value } = desc
            if (get) desc.get = () => get.apply(realWindow)
            if (set) desc.set = (val: any) => set.apply(realWindow, val)

            if (value && typeof value === 'function') {
                desc.value = function(...args: any[]) {
                    if (new.target) return new value(...args)
                    return Reflect.apply(value, realWindow, args)
                }
                desc.value.prototype = value.prototype
            }
        }
        return webAPIs
    }
})()
export class WebExtensionEnvironment implements Realm<typeof globalThis> {
    private realm = RealmConstructor.makeRootRealm()
    get global() {
        return this.realm.global
    }
    readonly [Symbol.toStringTag] = 'Realm'
    evaluate(sourceText: string) {
        return this.realm.evaluate(sourceText)
    }
    constructor(public extensionID: string, public manifest: Manifest) {
        this.init()
    }
    init() {
        Object.defineProperties(this.global, staticGlobal(this.global))
        this.global.browser = BrowserFactory(this.extensionID, this.manifest)
        this.global.URL = enhanceURL(this.global.URL, this.extensionID)
        Object.defineProperties(this.global, {
            window: {
                configurable: false,
                writable: false,
                enumerable: true,
                value: this.global,
            },
            global: {
                configurable: false,
                writable: false,
                enumerable: true,
                value: this.global,
            },
        })
        Object.assign(this.global, {
            globalThis: this.global,
        })
    }
}
