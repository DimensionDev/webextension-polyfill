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
 * - [ ] Main thread cannot access ContentScript
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
import { createChromeFromBrowser } from './chrome'
/**
 * Apply all WebAPIs to the clean sandbox created by Realm
 */
const PrepareWebAPIs = (() => {
    // ? replace Function with polluted version by Realms
    // ! this leaks the sandbox!
    // We're no longer using realms now.
    // Object.defineProperty(
    //     Object.getPrototypeOf(() => {}),
    //     'constructor',
    //     {
    //         value: globalThis.Function,
    //     },
    // )
    const realWindow = window
    const webAPIs = Object.getOwnPropertyDescriptors(window)
    return (sandboxRoot: typeof globalThis, locationProxy?: Location) => {
        // ?
        // const sandboxDocument = cloneObjectWithInternalSlot(document, sandboxRoot, {
        //     descriptorsModifier(obj, desc) {
        //         if ('defaultView' in desc) desc.defaultView.get = () => sandboxRoot
        //         return desc
        //     },
        // })
        const clonedWebAPIs: Record<string, PropertyDescriptor> = {
            ...(webAPIs as any),
            // document: { configurable: false, enumerable: true, get: () => sandboxDocument },
        }
        if ('window' in realWindow) {
            clonedWebAPIs.window = { value: sandboxRoot }
        }
        if ('self' in realWindow) {
            clonedWebAPIs.self = { value: sandboxRoot }
        }
        for (const key in clonedWebAPIs)
            if (clonedWebAPIs[key].value === globalThis) clonedWebAPIs[key].value = sandboxRoot
        if (locationProxy) clonedWebAPIs.location.get = () => locationProxy
        for (const key in clonedWebAPIs) if (key in sandboxRoot) delete clonedWebAPIs[key]
        cloneObjectWithInternalSlot(realWindow, sandboxRoot, {
            nextObject: sandboxRoot,
            designatedOwnDescriptors: clonedWebAPIs,
        })
        // restore the identity continuity
        sandboxRoot.Object = Object
        sandboxRoot.Function = Function
    }
})()
const { log, warn } = console
const { get } = Reflect
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
        log('[WebExtension] Managed Realm created.')
        PrepareWebAPIs(this.globalThis, locationProxy)
        const browser = BrowserFactory(this.extensionID, this.manifest, this.globalThis.Object.prototype)
        const chrome = createChromeFromBrowser(browser)
        Object.defineProperty(this.globalThis, 'browser', {
            // ? Mozilla's polyfill may overwrite this. Figure this out.
            get: () => browser,
            set: () => false,
        })
        Object.defineProperty(this.globalThis, 'chrome', { enumerable: true, writable: true, value: chrome })
        this.globalThis.URL = enhanceURL(this.globalThis.URL, extensionID)
        this.globalThis.fetch = createFetch(extensionID)
        this.globalThis.open = openEnhanced(extensionID)
        this.globalThis.close = closeEnhanced(extensionID)
        this.globalThis.Worker = enhancedWorker(extensionID)
        // Preserve webkit on it's first access.
        let webkit: unknown
        Object.defineProperty(this.globalThis, 'webkit', {
            enumerable: false,
            configurable: true,
            get: () => {
                if (webkit) return webkit
                return (webkit = get(globalThis, 'webkit', globalThis))
            },
        })
    }
    async fetchPrebuilt(kind: ModuleKind, url: string): Promise<{ content: string; asSystemJS: boolean } | null> {
        const content = await this.fetchSourceText(url + `.prebuilt-${PrebuiltVersion}-${kind}`)
        if (!content) return null
        if (kind === 'module') return { content: content, asSystemJS: true }
        const flag = content.slice(0, 4)
        return { content, asSystemJS: flag === '//d\n' }
    }
    protected async fetchSourceText(url: string) {
        const res = await getResourceAsync(this.extensionID, {}, url)
        if (res) return res
        return null
    }
}
