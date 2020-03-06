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
import { SystemJSRealm, ModuleKind } from '../realms'
import { enhancedWorker } from '../hijacks/Worker.prototype.constructor'
import { getResourceAsync } from '../utils/Resources'
import { cloneObjectWithInternalSlot } from '../utils/internal-slot'
import { PrebuiltVersion } from '../transformers'
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
    return (sandboxRoot: typeof globalThis, locationProxy?: Location) => {
        const sandboxDocument = cloneObjectWithInternalSlot(document, sandboxRoot, {
            descriptorsModifier(obj, desc) {
                if ('defaultView' in desc) desc.defaultView.get = () => sandboxRoot
                return desc
            },
        })
        const clonedWebAPIs: Record<string, PropertyDescriptor> = {
            ...(webAPIs as any),
            window: { configurable: false, writable: false, enumerable: true, value: sandboxRoot },
            document: { configurable: false, enumerable: true, get: () => sandboxDocument },
        }
        if (locationProxy) clonedWebAPIs.location.value = locationProxy
        for (const key in clonedWebAPIs) if (key in sandboxRoot) delete clonedWebAPIs[key]
        Object.assign(sandboxRoot, { globalThis: sandboxRoot, self: sandboxRoot })
        cloneObjectWithInternalSlot(realWindow, sandboxRoot, {
            nextObject: sandboxRoot,
            designatedOwnDescriptors: clonedWebAPIs,
        })
    }
})()
/**
 * Execution environment of managed Realm (including content script in production and all env in runtime).
 */
export class WebExtensionManagedRealm extends SystemJSRealm {
    /**
     * Create a new running extension for an content script.
     * @param extensionID The extension ID
     * @param manifest The manifest of the extension
     */
    constructor(public extensionID: string, public manifest: Manifest, locationProxy?: Location) {
        super()
        console.log('[WebExtension] Managed Realm created.')
        PrepareWebAPIs(this.global, locationProxy)
        const browser = BrowserFactory(this.extensionID, this.manifest, this.global.Object.prototype)
        Object.defineProperty(this.global, 'browser', {
            // ? Mozilla's polyfill may overwrite this. Figure this out.
            get: () => browser,
            set: () => false,
        })
        this.global.URL = enhanceURL(this.global.URL, extensionID)
        this.global.fetch = createFetch(extensionID)
        this.global.open = openEnhanced(extensionID)
        this.global.close = closeEnhanced(extensionID)
        this.global.Worker = enhancedWorker(extensionID)
        if (locationProxy) this.global.location = locationProxy
        // function globalThisFix() {
        //     var originalFunction = Function
        //     function newFunction(...args: any[]) {
        //         const fn = new originalFunction(...args)
        //         return new Proxy(fn, {
        //             apply(a, b, c) {
        //                 return Reflect.apply(a, b || globalThis, c)
        //             },
        //         })
        //     }
        //     // @ts-ignore
        //     globalThis.Function = newFunction
        // }
        // this.esRealm.evaluate(globalThisFix.toString() + '\n' + globalThisFix.name + '()')
    }
    async fetchPrebuilt(kind: ModuleKind, url: string): Promise<{ content: string; asSystemJS: boolean } | null> {
        const res = await this.fetchSourceText(url + `.prebuilt-${PrebuiltVersion}-${kind}`)
        if (!res) return null
        if (kind === 'module') return { content: res, asSystemJS: true }
        const [flag] = res
        return { content: res.slice(1), asSystemJS: flag === 'd' }
    }
    protected async fetchSourceText(url: string) {
        const res = await getResourceAsync(this.extensionID, {}, url)
        if (res) return res
        return null
    }
}
