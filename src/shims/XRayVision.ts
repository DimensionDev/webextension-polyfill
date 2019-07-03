import RealmConstructor, { Realm } from 'realms-shim'

import { BrowserFactory } from './browser'
import { Manifest } from '../Extensions'
import { enhanceURL } from './URL.create+revokeObjectURL'

function getPrototypeChain(o: any, _: any[] = []): any[] {
    if (o === undefined || o === null) return _
    const y = Object.getPrototypeOf(o)
    if (y === null || y === undefined || y === Object.prototype) return _
    return getPrototypeChain(Object.getPrototypeOf(y), [..._, y])
}
const PrepareWebAPIs = (() => {
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
        const clonedWebAPIs = { ...webAPIs }
        Object.getOwnPropertyNames(sandboxRoot).forEach(name => Reflect.deleteProperty(clonedWebAPIs, name))
        // ? Clone Web APIs
        for (const key in webAPIs) {
            PatchThisOfDescriptorToGlobal(webAPIs[key], realWindow)
        }
        Object.defineProperty(sandboxRoot, 'window', {
            configurable: false,
            writable: false,
            enumerable: true,
            value: sandboxRoot,
        })
        Object.assign(sandboxRoot, { globalThis: sandboxRoot })
        const proto = getPrototypeChain(realWindow)
            .map(Object.getOwnPropertyDescriptors)
            .reduceRight((previous, current) => {
                const copy = { ...current }
                for (const key in current) {
                    PatchThisOfDescriptorToGlobal(current[key], realWindow)
                }
                return Object.create(previous, current)
            }, {})
        Object.setPrototypeOf(sandboxRoot, proto)
        Object.defineProperties(sandboxRoot, clonedWebAPIs)
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
        PrepareWebAPIs(this.global)
        this.global.browser = BrowserFactory(this.extensionID, this.manifest)
        this.global.URL = enhanceURL(this.global.URL, this.extensionID)
    }
}
function PatchThisOfDescriptorToGlobal(desc: PropertyDescriptor, global: Window) {
    const { get, set, value } = desc
    if (get) desc.get = () => get.apply(global)
    if (set) desc.set = (val: any) => set.apply(global, val)
    if (value && typeof value === 'function') {
        desc.value = function(...args: any[]) {
            if (new.target) return new value(...args)
            return Reflect.apply(value, global, args)
        }
        desc.value.prototype = value.prototype
    }
}
