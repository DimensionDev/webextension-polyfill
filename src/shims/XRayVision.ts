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
import Realm, { Realm as RealmInstance } from 'realms-shim'

import { BrowserFactory } from './browser'
import { Manifest } from '../Extensions'
import { enhanceURL } from './URL.create+revokeObjectURL'
import { createFetch } from './fetch'
import { openEnhanced, closeEnhanced } from './window.open+close'
import { transformAST } from '../transformers'
import { SystemJSRealm } from '../realms'
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
    Object.defineProperty(
        Object.getPrototypeOf(() => {}),
        'constructor',
        {
            value: globalThis.Function,
        },
    )
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
        Object.assign(sandboxRoot, { globalThis: sandboxRoot, self: sandboxRoot })
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
export class WebExtensionContentScriptEnvironment extends SystemJSRealm {
    /**
     * Create a new running extension for an content script.
     * @param extensionID The extension ID
     * @param manifest The manifest of the extension
     */
    constructor(public extensionID: string, public manifest: Manifest, private locationProxy?: Location) {
        super()
        console.log('[WebExtension] Hosted JS environment created.')
        PrepareWebAPIs(this.global)
        const browser = BrowserFactory(this.extensionID, this.manifest, this.global.Object.prototype)
        Object.defineProperty(this.global, 'browser', {
            // ? Mozilla's polyfill may overwrite this. Figure this out.
            get: () => browser,
            set: () => false,
        })
        this.global.browser = BrowserFactory(this.extensionID, this.manifest, this.global.Object.prototype)
        this.global.URL = enhanceURL(this.global.URL, this.extensionID)
        this.global.fetch = createFetch(this.extensionID)
        this.global.open = openEnhanced(this.extensionID)
        this.global.close = closeEnhanced(this.extensionID)
        if (this.locationProxy) this.global.location = this.locationProxy
        function globalThisFix() {
            var originalFunction = Function
            function newFunction(...args: any[]) {
                const fn = new originalFunction(...args)
                return new Proxy(fn, {
                    apply(a, b, c) {
                        return Reflect.apply(a, b || globalThis, c)
                    },
                })
            }
            // @ts-ignore
            globalThis.Function = newFunction
        }
        this.esRealm.evaluate(globalThisFix.toString() + '\n' + globalThisFix.name + '()')
    }
    protected fetch = createFetch(this.extensionID)
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
            value.prototype && Object.setPrototypeOf(desc.value, value.prototype)
        } catch {}
    }
}
