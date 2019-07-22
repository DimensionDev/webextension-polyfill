/**
 * This file partly implements XRayVision in Firefox's WebExtension standard
 * by create a two-way JS sandbox but shared DOM environment.
 *
 * class WebExtensionContentScriptEnvironment will return a new JS environment
 * that has a "browser" variable inside of it and a clone of the current DOM environment
 * to prevent the main thread hack on prototype to access the content of ContentScripts.
 *
 * ## Checklist:
 * - [o] ContentScript cannot access main thread
 * - [?] Main thread cannot access ContentScript
 * - [o] ContentScript can access main thread's DOM
 * - [ ] ContentScript modification on DOM prototype is not discoverable by main thread
 * - [ ] Main thread modification on DOM prototype is not discoverable by ContentScript
 */
import RealmConstructor, { Realm } from 'realms-shim'

import { BrowserFactory } from './browser'
import { Manifest } from '../Extensions'
import { enhanceURL } from './URL.create+revokeObjectURL'
import { createFetch } from './fetch'
import { createWebSocket } from './WebSocket'
/**
 * Recursively get the prototype chain of an Object
 * @param o Object
 */
function getPrototypeChain(o: any, _: any[] = []): any[] {
    if (o === undefined || o === null) return _
    const y = Object.getPrototypeOf(o)
    if (y === null || y === undefined || y === Object.prototype) return _
    return getPrototypeChain(Object.getPrototypeOf(y), [..._, y])
}
/**
 * Apply all WebAPIs to the clean sandbox created by Realm
 */
const PrepareWebAPIs = (() => {
    // ? replace Function with polluted version by Realms
    // ! this leaks the sandbox!
    Object.defineProperty(Object.getPrototypeOf(() => {}), 'constructor', {
        value: globalThis.Function,
    })
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
                for (const key in copy) {
                    PatchThisOfDescriptorToGlobal(copy[key], realWindow)
                }
                return Object.create(previous, copy)
            }, {})
        Object.setPrototypeOf(sandboxRoot, proto)
        Object.defineProperties(sandboxRoot, clonedWebAPIs)
    }
})()
/**
 * Execution environment of ContentScript
 */
export class WebExtensionContentScriptEnvironment implements Realm<typeof globalThis & { browser: typeof browser }> {
    private realm = RealmConstructor.makeRootRealm()
    get global() {
        return this.realm.global
    }
    readonly [Symbol.toStringTag] = 'Realm'
    /**
     * Evaluate a string in the content script environment
     * @param sourceText Source text
     */
    evaluate(sourceText: string) {
        return this.realm.evaluate(sourceText)
    }
    /**
     * Create a new running extension for an content script.
     * @param extensionID The extension ID
     * @param manifest The manifest of the extension
     */
    constructor(public extensionID: string, public manifest: Manifest) {
        this.init()
    }
    private init() {
        PrepareWebAPIs(this.global)
        this.global.browser = BrowserFactory(this.extensionID, this.manifest)
        this.global.URL = enhanceURL(this.global.URL, this.extensionID)
        this.global.fetch = createFetch(this.extensionID)
        this.global.WebSocket = createWebSocket(this.extensionID)
    }
}
/**
 * Many methods on `window` requires `this` points to a Window object
 * Like `alert()`. If you call alert as `const w = { alert }; w.alert()`,
 * there will be an Illegal invocation.
 *
 * To prevent `this` binding lost, we need to rebind it.
 *
 * @param desc PropertyDescriptor
 * @param global The real window
 */
function PatchThisOfDescriptorToGlobal(desc: PropertyDescriptor, global: Window) {
    const { get, set, value } = desc
    if (get) desc.get = () => get.apply(global)
    if (set) desc.set = (val: any) => set.apply(global, val)
    if (value && typeof value === 'function') {
        const desc2 = Object.getOwnPropertyDescriptors(value)
        desc.value = function(...args: any[]) {
            if (new.target) return Reflect.construct(value, args, new.target)
            return Reflect.apply(value, global, args)
        }
        Object.defineProperties(desc.value, desc2)
        try {
            // ? For unknown reason this fail for some objects on Safari.
            desc.value.prototype = value.prototype
        } catch {}
    }
}
