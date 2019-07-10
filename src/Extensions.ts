import { matchingURL } from './utils/URLMatcher'
import { WebExtensionContentScriptEnvironment } from './shims/XRayVision'
import { BrowserFactory } from './shims/browser'
import { createFetch } from './shims/fetch'

export type WebExtensionID = string
export type Manifest = Partial<browser.runtime.Manifest> &
    Pick<browser.runtime.Manifest, 'name' | 'version' | 'manifest_version'>
export interface WebExtension {
    manifest: Manifest
    environment: WebExtensionContentScriptEnvironment
}
export const registeredWebExtension = new Map<WebExtensionID, WebExtension>()
export function registerWebExtension(
    extensionID: string,
    manifest: Manifest,
    environment: 'content script' | 'background script',
    preloadedResources: Record<string, string> = {},
) {
    console.debug(
        `[WebExtension] Loading extension ${manifest.name}(${extensionID}) with manifest`,
        manifest,
        `and preloaded resource`,
        preloadedResources,
        `in ${environment} mode`,
    )
    try {
        if (environment === 'content script') {
            LoadContentScript(manifest, extensionID, preloadedResources)
        } else if (environment === 'background script') {
            LoadBackgroundScript(manifest, extensionID, preloadedResources)
        } else {
            console.warn(`[WebExtension] unknown running environment ${environment}`)
        }
    } catch (e) {
        console.error(e)
    }
    return registeredWebExtension.get(extensionID)
}

function LoadBackgroundScript(manifest: Manifest, extensionID: string, preloadedResources: Record<string, string>) {
    if (!manifest.background) return
    const { page, scripts } = manifest.background as any
    if (page) return console.warn('[WebExtension] manifest.background.page is not supported yet!')
    if (location.hostname !== 'localhost' && !location.href.startsWith('holoflows-extension://')) {
        throw new TypeError(`Background script only allowed in localhost(for debugging) and holoflows-extension://`)
    }
    {
        const src = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src')!
        Object.defineProperty(HTMLScriptElement.prototype, 'src', {
            get() {
                return src.get!.call(this)
            },
            set(val) {
                console.log('Loading ', val)
                if (val in preloadedResources || val.replace(/^\//, '') in preloadedResources) {
                    RunInGlobalScope(extensionID, preloadedResources[val] || preloadedResources[val.replace(/^\//, '')])
                    return true
                }
                src.set!.call(this, val)
                return true
            },
        })
    }
    Object.assign(window, {
        browser: BrowserFactory(extensionID, manifest),
        fetch: createFetch(extensionID),
    } as Partial<typeof globalThis>)
    for (const path of (scripts as string[]) || []) {
        if (typeof preloadedResources[path] === 'string') {
            // ? Run it in global scope.
            RunInGlobalScope(extensionID, preloadedResources[path])
        } else {
            console.warn(`[WebExtension] Content scripts preload not found for ${manifest.name}: ${path}`)
        }
    }
}
function RunInGlobalScope(extensionID: string, src: string) {
    if (location.protocol === 'holoflows-extension:') return new Function(src)()
    const f = new Function(`with (
                new Proxy(window, {
                    get(target, key) {
                        if (key === 'location')
                            return new URL("holoflows-extension://${extensionID}/_generated_background_page.html")
                        if(typeof target[key] === 'function') {
                            const desc2 = Object.getOwnPropertyDescriptors(target[key])
                            function f(...args) {
                                if (new.target) return Reflect.construct(target[key], args, new.target)
                                return Reflect.apply(target[key], window, args)
                            }
                            Object.defineProperties(f, desc2)
                            f.prototype = target[key].prototype
                            return f
                        }
                        return target[key]
                    }
                }
            )) {
                ${src}
              }`)
    f()
}

function LoadContentScript(manifest: Manifest, extensionID: string, preloadedResources: Record<string, string>) {
    for (const [index, content] of (manifest.content_scripts || []).entries()) {
        warningNotImplementedItem(content, index)
        if (
            matchingURL(
                new URL(location.href),
                content.matches,
                content.exclude_matches || [],
                content.include_globs || [],
                content.exclude_globs || [],
                content.match_about_blank,
            )
        ) {
            console.debug(`[WebExtension] Loading content script for`, content)
            loadContentScript(extensionID, manifest, content, preloadedResources)
        } else {
            console.debug(`[WebExtension] URL mismatched. Skip content script for, `, content)
        }
    }
}

function loadContentScript(
    extensionID: string,
    manifest: Manifest,
    content: NonNullable<Manifest['content_scripts']>[0],
    content_scripts: Record<string, string>,
) {
    if (!registeredWebExtension.has(extensionID)) {
        const environment = new WebExtensionContentScriptEnvironment(extensionID, manifest)
        const ext: WebExtension = {
            manifest,
            environment,
        }
        registeredWebExtension.set(extensionID, ext)
    }
    const { environment } = registeredWebExtension.get(extensionID)!
    for (const path of content.js || []) {
        if (typeof content_scripts[path] === 'string') {
            environment.evaluate(content_scripts[path])
        } else {
            console.warn(`[WebExtension] Content scripts preload not found for ${manifest.name}: ${path}`)
        }
    }
}

function warningNotImplementedItem(content: NonNullable<Manifest['content_scripts']>[0], index: number) {
    if (content.all_frames)
        console.warn(`all_frames not supported yet. Defined at manifest.content_scripts[${index}].all_frames`)
    if (content.css) console.warn(`css not supported yet. Defined at manifest.content_scripts[${index}].css`)
    if (content.run_at && content.run_at !== 'document_start')
        console.warn(`run_at not supported yet. Defined at manifest.content_scripts[${index}].run_at`)
}
