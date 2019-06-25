import Realm from 'realms-shim'

import { BrowserFactory } from './browser'

class WebExtensionEnvironment {
    constructor(extensionID: string, manifest: any) {
        const realm = Realm.makeRootRealm()
        realm.global.browser = BrowserFactory(extensionID, manifest)
        Object.defineProperties(realm.global, WebExtensionEnvironment.staticGlobal)
        return realm as any
    }
    private static readonly staticGlobal = (() => {
        const obj = Object.getOwnPropertyDescriptors(globalThis)
        for (const key in obj) {
            const desc = obj[key]
            const { get, set, value } = desc
            if (get) desc.get = () => get.apply(globalThis)
            if (set) desc.set = (val: any) => set.apply(globalThis, val)

            if (value && typeof value === 'function')
                desc.value = function(...args: any) {
                    console.log(this)
                    return value.apply(globalThis, ...args)
                }
        }
        return obj
    })()
}
Object.setPrototypeOf(WebExtensionEnvironment.prototype, Realm.prototype)

const extension = new WebExtensionEnvironment('$ExtensionUUID', JSON.parse('$ExtensionManifest'))
Object.assign(window, { Realm, extension })
