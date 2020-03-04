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
import { BrowserFactory } from './browser'
import { Manifest } from '../Extensions'
import { enhanceURL } from './URL.create+revokeObjectURL'
import { createFetch } from './fetch'
import { openEnhanced, closeEnhanced } from './window.open+close'
import { SystemJSRealm } from '../realms'
import { enhancedWorker } from '../hijacks/Worker.prototype.constructor'
/**
 * Recursively get the prototype chain of an Object
 * @param o Object
 */
function getPrototypeChain(o: object, _: object[] = []): object[] {
    if (o === undefined || o === null) return _
    const y = Object.getPrototypeOf(o)
    if (y === null || y === undefined || y === Object.prototype || y === Function.prototype) return _
    return getPrototypeChain(y, [..._, y])
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
    Reflect.deleteProperty(webAPIs, 'globalThis')
    Reflect.deleteProperty(webAPIs, 'self')
    Reflect.deleteProperty(webAPIs, 'global')
    const cachedPropertyDescriptor = new WeakMap<typeof globalThis, Map<object, object>>()
    return (sandboxRoot: typeof globalThis) => {
        const sandboxDocument = cloneObjectWithInternalSlot(document, sandboxRoot, {
            descriptorsModifier(obj, desc) {
                if ('defaultView' in desc) {
                    desc.defaultView.get = () => sandboxRoot
                }
                return desc
            },
        })
        const clonedWebAPIs: Record<string, PropertyDescriptor> = {
            ...(webAPIs as any),
            window: { configurable: false, writable: false, enumerable: true, value: sandboxRoot },
            document: { configurable: false, enumerable: true, get: () => sandboxDocument },
        }
        for (const key in clonedWebAPIs) if (key in sandboxRoot) delete clonedWebAPIs[key]
        Object.assign(sandboxRoot, { globalThis: sandboxRoot, self: sandboxRoot })
        cloneObjectWithInternalSlot(realWindow, sandboxRoot, {
            nextObject: sandboxRoot,
            designatedOwnDescriptors: clonedWebAPIs,
        })
    }
    function cloneObjectWithInternalSlot<T extends object>(
        original: T,
        realm: typeof globalThis,
        traps: {
            nextObject?: object
            designatedOwnDescriptors?: Record<string, PropertyDescriptor>
            descriptorsModifier?: (object: object, desc: Record<string, PropertyDescriptor>) => typeof desc
        },
    ) {
        const ownDescriptor = traps.designatedOwnDescriptors ?? Object.getOwnPropertyDescriptors(original)
        const prototypeChain = getPrototypeChain(original)
        if (!cachedPropertyDescriptor.has(realm)) cachedPropertyDescriptor.set(realm, new Map())
        const cacheMap = cachedPropertyDescriptor.get(realm)!
        const newProto = prototypeChain.reduceRight((previous, current) => {
            if (cacheMap.has(current)) return cacheMap.get(current)!
            const desc = Object.getOwnPropertyDescriptors(current)
            const obj = Object.create(
                previous,
                PatchThisOfDescriptors(traps.descriptorsModifier?.(current, desc) ?? desc, original),
            )
            cacheMap.set(current, obj)
            return obj
        }, {})
        const next = traps.nextObject || Object.create(null)
        Object.defineProperties(next, PatchThisOfDescriptors(ownDescriptor, original))
        Object.setPrototypeOf(next, newProto)
        return next
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
        this.global.browser = BrowserFactory(extensionID, manifest, this.global.Object.prototype)
        this.global.URL = enhanceURL(this.global.URL, extensionID)
        this.global.fetch = createFetch(extensionID)
        this.global.open = openEnhanced(extensionID)
        this.global.close = closeEnhanced(extensionID)
        this.global.Worker = enhancedWorker(extensionID)
        if (locationProxy) this.global.location = locationProxy
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
 * Many native methods requires `this` points to a native object
 * Like `alert()`. If you call alert as `const w = { alert }; w.alert()`,
 * there will be an Illegal invocation.
 *
 * To prevent `this` binding lost, we need to rebind it.
 *
 * @param desc PropertyDescriptor
 * @param native The native object
 */
function PatchThisOfDescriptorToNative(desc: PropertyDescriptor, native: object) {
    const { get, set, value } = desc
    if (get) desc.get = () => get.apply(native)
    if (set) desc.set = (val: any) => set.apply(native, val)
    if (value && typeof value === 'function') {
        const desc2 = Object.getOwnPropertyDescriptors(value)
        desc.value = function() {
            if (new.target) return Reflect.construct(value, arguments, new.target)
            return Reflect.apply(value, native, arguments)
        }
        delete desc2.arguments
        delete desc2.caller
        delete desc2.callee
        Object.defineProperties(desc.value, desc2)
        try {
            // ? For unknown reason this fail for some objects on Safari.
            value.prototype && Object.setPrototypeOf(desc.value, value.prototype)
        } catch {}
    }
}
function PatchThisOfDescriptors(desc: Record<string, PropertyDescriptor>, native: object): typeof desc {
    const _ = Object.entries(desc).map(([x, y]) => [x, { ...y }] as const)
    _.forEach(x => PatchThisOfDescriptorToNative(x[1], native))
    return Object.fromEntries(_)
}
