import { matchingURL } from './utils/URLMatcher'
import { WebExtensionContentScriptEnvironment } from './shims/XRayVision'
import { BrowserFactory } from './shims/browser'
import { createFetch } from './shims/fetch'
import { enhanceURL } from './shims/URL.create+revokeObjectURL'
import { openEnhanced, closeEnhanced } from './shims/window.open+close'
import { getResource, getResourceAsync } from './utils/Resources'

export type WebExtensionID = string
export type Manifest = Partial<browser.runtime.Manifest> &
    Pick<browser.runtime.Manifest, 'name' | 'version' | 'manifest_version'>
export interface WebExtension {
    manifest: Manifest
    environment: WebExtensionContentScriptEnvironment
    preloadedResources: Record<string, string>
}
export const registeredWebExtension = new Map<WebExtensionID, WebExtension>()
export function registerWebExtension(
    extensionID: string,
    manifest: Manifest,
    preloadedResources: Record<string, string> = {},
) {
    const environment: 'content script' | 'background script' =
        location.href.startsWith('holoflows-extension://') && location.href.endsWith('_generated_background_page.html')
            ? 'background script'
            : 'content script'
    console.debug(
        `[WebExtension] Loading extension ${manifest.name}(${extensionID}) with manifest`,
        manifest,
        `and preloaded resource`,
        preloadedResources,
        `in ${environment} mode`,
    )
    if (location.protocol === 'holoflows-extension:') prepareBackgroundAndOptionsPageEnvironment(extensionID, manifest)

    try {
        if (environment === 'content script') {
            untilDocumentReady().then(() => LoadContentScript(manifest, extensionID, preloadedResources))
        } else if (environment === 'background script') {
            untilDocumentReady().then(() => LoadBackgroundScript(manifest, extensionID, preloadedResources))
        } else {
            console.warn(`[WebExtension] unknown running environment ${environment}`)
        }
    } catch (e) {
        console.error(e)
    }
    return registeredWebExtension
}

function untilDocumentReady() {
    if (document.readyState === 'complete') return Promise.resolve()
    return new Promise(resolve => {
        document.addEventListener('readystatechange', resolve, { once: true, passive: true })
    })
}

async function LoadBackgroundScript(
    manifest: Manifest,
    extensionID: string,
    preloadedResources: Record<string, string>,
) {
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
            set(path) {
                console.log('Loading ', path)
                const preloaded = getResource(extensionID, preloadedResources, path)
                if (preloaded) RunInGlobalScope(extensionID, preloaded)
                else
                    getResourceAsync(extensionID, preloadedResources, path)
                        .then(code => code || Promise.reject<string>('Loading resource failed'))
                        .then(code => RunInGlobalScope(extensionID, code))
                        .catch(e => console.error(`Failed when loading resource`, path))
                src.set!.call(this, path)
                return true
            },
        })
    }
    for (const path of (scripts as string[]) || []) {
        const preloaded = await getResourceAsync(extensionID, preloadedResources, path)
        if (preloaded) {
            // ? Run it in global scope.
            RunInGlobalScope(extensionID, preloaded)
        } else {
            console.error(`[WebExtension] Background scripts not found for ${manifest.name}: ${path}`)
        }
    }
}
function prepareBackgroundAndOptionsPageEnvironment(extensionID: string, manifest: Manifest) {
    Object.assign(window, {
        browser: BrowserFactory(extensionID, manifest),
        fetch: createFetch(extensionID, window.fetch),
        URL: enhanceURL(URL, extensionID),
        open: openEnhanced(extensionID),
        close: closeEnhanced(extensionID),
    } as Partial<typeof globalThis>)
}

function RunInGlobalScope(extensionID: string, src: string): void {
    if (location.protocol === 'holoflows-extension:') {
        const likeESModule = src.match('import ') || src.match('export ')
        const script = document.createElement('script')
        script.type = likeESModule ? 'module' : 'text/javascript'
        script.src = src
        return
        // return new Function(src)()
    }
    console.warn(
        '[Deprecation] This script should run in the holoflows-extension:// scheme, in the future version, it will throw instead of a warning',
    )
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

async function LoadContentScript(manifest: Manifest, extensionID: string, preloadedResources: Record<string, string>) {
    if (!registeredWebExtension.has(extensionID)) {
        const environment = new WebExtensionContentScriptEnvironment(extensionID, manifest)
        const ext: WebExtension = {
            manifest,
            environment,
            preloadedResources,
        }
        registeredWebExtension.set(extensionID, ext)
    }
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
            await loadContentScript(extensionID, manifest, content, preloadedResources)
        } else {
            console.debug(`[WebExtension] URL mismatched. Skip content script for, `, content)
        }
    }
}

export async function loadContentScript(
    extensionID: string,
    manifest: Manifest,
    content: NonNullable<Manifest['content_scripts']>[0],
    preloadedResources: Record<string, string> = registeredWebExtension.has(extensionID)
        ? registeredWebExtension.get(extensionID)!.preloadedResources
        : {},
) {
    const { environment } = registeredWebExtension.get(extensionID)!
    for (const path of content.js || []) {
        const preloaded = await getResourceAsync(extensionID, preloadedResources, path)
        if (preloaded) {
            environment.evaluate(preloaded)
        } else {
            console.error(`[WebExtension] Content scripts not found for ${manifest.name}: ${path}`)
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
