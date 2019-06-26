import Realm from 'realms-shim'

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
                desc.value = function() {
                    // ? Only native objects will have access to realWindow
                    return value.call(realWindow, arguments)
                }
            }
        }
        debugger
        return webAPIs
    }
})()
export class WebExtensionEnvironment {
    public realm = Realm.makeRootRealm()
    constructor(extensionID: string, manifest: Manifest) {
        Object.defineProperties(this.realm.global, staticGlobal(this.realm.global))
        this.realm.global.browser = BrowserFactory(extensionID, manifest)
        this.realm.global.URL = enhanceURL(this.realm.global.URL, extensionID)
        Object.defineProperties(this.realm.global, {
            window: {
                configurable: false,
                writable: false,
                enumerable: true,
                value: this.realm.global,
            },
        })
        Object.assign(this.realm.global, {
            globalThis: this.realm.global,
        })
    }
}
// ? Realm is not subclassable currently.
Object.setPrototypeOf(WebExtensionEnvironment.prototype, Realm.prototype)
