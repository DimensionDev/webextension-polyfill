import { matchingURL } from './utils/URLMatcher'
import { WebExtensionContentScriptEnvironment } from './shims/XRayVision'
import { BrowserFactory } from './shims/browser'
import { createFetch } from './shims/fetch'
import { enhanceURL } from './shims/URL.create+revokeObjectURL'
import { openEnhanced, closeEnhanced } from './shims/window.open+close'
import { getResource, getResourceAsync } from './utils/Resources'
import { EventPools } from './utils/LocalMessages'
import { reservedID, useInternalStorage } from './internal'
import { isDebug } from './debugger/isDebugMode'

export type WebExtensionID = string
export type Manifest = Partial<browser.runtime.Manifest> &
    Pick<browser.runtime.Manifest, 'name' | 'version' | 'manifest_version'>
export interface WebExtension {
    manifest: Manifest
    environment: WebExtensionContentScriptEnvironment
    preloadedResources: Record<string, string>
}
export const registeredWebExtension = new Map<WebExtensionID, WebExtension>()
enum Environment {
    contentScript = 'Content script',
    backgroundScript = 'Background script',
    pageAction = 'Popup action',
    optionsPage = 'Options page',
}
export async function registerWebExtension(
    extensionID: string,
    manifest: Manifest,
    preloadedResources: Record<string, string> = {},
) {
    if (extensionID === reservedID)
        throw new TypeError('You cannot use reserved id ' + reservedID + ' as the extension id')
    let environment: Environment = getContext(manifest, extensionID, preloadedResources)
    try {
        switch (environment) {
            case Environment.optionsPage:
                prepareExtensionProtocolEnvironment(extensionID, manifest)
                break
            case Environment.pageAction:
                prepareExtensionProtocolEnvironment(extensionID, manifest)
                break
            case Environment.backgroundScript:
                prepareExtensionProtocolEnvironment(extensionID, manifest)
                await untilDocumentReady()
                await LoadBackgroundScript(manifest, extensionID, preloadedResources)
                break
            case Environment.contentScript:
                await untilDocumentReady()
                await LoadContentScript(manifest, extensionID, preloadedResources)
                break
            default:
                console.warn(`[WebExtension] unknown running environment ${environment}`)
        }
    } catch (e) {
        console.error(e)
    }
    if (environment === Environment.backgroundScript) {
        const installHandler = EventPools['browser.runtime.onInstall'].get(extensionID)
        if (installHandler) {
            setTimeout(() => {
                useInternalStorage(extensionID, o => {
                    const handlers = Array.from(installHandler.values()) as callback[]
                    type callback = typeof browser.runtime.onInstalled.addListener extends ((...args: infer T) => any)
                        ? T[0]
                        : never
                    ;[]
                    if (o.previousVersion)
                        handlers.forEach(x => x({ previousVersion: o.previousVersion, reason: 'update' }))
                    else handlers.forEach(x => x({ reason: 'install' }))
                    o.previousVersion = manifest.version
                })
            }, 2000)
        }
    }
    return registeredWebExtension
}

function getContext(manifest: Manifest, extensionID: string, preloadedResources: Record<string, string>) {
    let environment: Environment
    if (location.protocol === 'holoflows-extension:') {
        if (location.pathname === '/_generated_background_page.html') {
            environment = Environment.backgroundScript
        } else if (
            manifest.background &&
            manifest.background.page &&
            location.pathname === '/' + manifest.background.page
        ) {
            environment = Environment.backgroundScript
        } else if (
            manifest.page_action &&
            manifest.page_action.default_popup &&
            location.pathname === '/' + manifest.page_action.default_popup
        ) {
            environment = Environment.pageAction
        } else environment = Environment.optionsPage
    } else if (isDebug) {
        // debug usage
        const param = new URL(location.href)
        const type = param.searchParams.get('type')
        if (type === 'b') environment = Environment.backgroundScript
        else if (type === 'c') environment = Environment.contentScript
        else if (type === 'p') environment = Environment.pageAction
        else if (type === 'o') environment = Environment.optionsPage
        else
            throw new TypeError(
                'To debug, ?type= must be one of (b)ackground, (c)ontent-script, (p)age-action-popup, (o)ptions-page, found ' +
                    type,
            )
    } else {
        environment = Environment.contentScript
    }
    console.debug(
        `[WebExtension] Loading extension ${manifest.name}(${extensionID}) with manifest`,
        manifest,
        `and preloaded resource`,
        preloadedResources,
        `in ${environment} mode`,
    )
    return environment
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
    if (!isDebug && location.protocol !== 'holoflows-extension:') {
        throw new TypeError(`Background script only allowed in localhost(for debugging) and holoflows-extension://`)
    }
    const { page, scripts } = manifest.background as any
    if (page) {
        if (scripts && scripts.length)
            throw new TypeError(`In the manifest, you can't have both "page" and "scripts" for background field!`)
        const pageURL = new URL(page, location.origin)
        if (pageURL.origin !== location.origin)
            throw new TypeError(`You can not specify a foreign origin for the background page`)
        const html = await getResourceAsync(extensionID, preloadedResources, page)
        if (!html) throw new TypeError('Cannot find background page.')
        if (isDebug) {
            const parser = new DOMParser()
            const dom = parser.parseFromString(html, 'text/html')
            const scripts = await Promise.all(
                Array.from(dom.querySelectorAll('script')).map(async script => {
                    const path = new URL(script.src).pathname
                    script.remove()
                    return [path, await getResourceAsync(extensionID, preloadedResources, path)]
                }),
            )
            document.write(new XMLSerializer().serializeToString(dom))
            for (const [path, script] of scripts) {
                if (script) RunInGlobalScope(extensionID, script)
                else console.error('Resource', path, 'not found')
            }
            const div = document.createElement('div')
            div.innerHTML = `<style>body{background: black; color: white;font-family: system-ui;}</style>
            This page is in the debug mode of webextension-polyfill<br />
            It's running in the background page mode`
            document.body.appendChild(div)
        } else {
            document.write(html)
        }
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
function prepareExtensionProtocolEnvironment(extensionID: string, manifest: Manifest) {
    Object.assign(window, {
        browser: BrowserFactory(extensionID, manifest),
        fetch: createFetch(extensionID, window.fetch),
        URL: enhanceURL(URL, extensionID),
        open: openEnhanced(extensionID),
        close: closeEnhanced(extensionID),
    } as Partial<typeof globalThis>)
}

function RunInGlobalScope(extensionID: string, source: string): void {
    if (location.protocol === 'holoflows-extension:') {
        const likeESModule = source.match('import') || source.match('export ')
        const script = document.createElement('script')
        script.type = likeESModule ? 'module' : 'text/javascript'
        script.innerText = source
        return
    }
    if (source.indexOf('browser')) {
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
                ${source}
              }`)
        f()
    } else {
        eval(source)
    }
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
