import { matchingURL } from './utils/URLMatcher'
import { WebExtensionContentScriptEnvironment } from './shims/XRayVision'
import { BrowserFactory } from './shims/browser'
import { createFetch } from './shims/fetch'
import { enhanceURL } from './shims/URL.create+revokeObjectURL'
import { openEnhanced, closeEnhanced } from './shims/window.open+close'
import { getResourceAsync } from './utils/Resources'
import { EventPools } from './utils/LocalMessages'
import { reservedID, useInternalStorage } from './internal'
import { isDebug } from './debugger/isDebugMode'
import { writeHTMLScriptElementSrc } from './hijacks/HTMLScript.prototype.src'
import { rewriteWorker } from './hijacks/Worker.prototype.constructor'

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
    protocolPage = 'Protocol page',
    debugModeManagedPage = 'managed page',
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
            case Environment.debugModeManagedPage:
                if (!isDebug) throw new TypeError('Invalid state')
                // TODO: fake a url.
                LoadContentScript(manifest, extensionID, preloadedResources)
                break
            case Environment.protocolPage:
                prepareExtensionProtocolEnvironment(extensionID, manifest)
                if (isDebug) {
                    const url = new URL(location.href).searchParams.get('url')
                    if (!url) throw new TypeError('This page need a "url" search param')
                    if (url === '_options_') {
                        LoadProtocolPage(extensionID, preloadedResources, manifest.options_ui!.page)
                    } else if (url === '_popup_') {
                        LoadProtocolPage(
                            extensionID,
                            preloadedResources,
                            manifest.page_action!.default_popup!.toString(),
                        )
                    } else LoadProtocolPage(extensionID, preloadedResources, url)
                }
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
        } else environment = Environment.protocolPage
    } else if (isDebug) {
        // debug usage
        const param = new URL(location.href)
        const type = param.searchParams.get('type')
        if (type === 'b') environment = Environment.backgroundScript
        else if (type === 'p') environment = Environment.protocolPage
        else if (type === 'm') environment = Environment.debugModeManagedPage
        else
            throw new TypeError(
                'To debug, ?type= must be one of (b)ackground, (p)rotocol-page, (m)anaged-page (used to debug content script), found ' +
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

async function LoadProtocolPage(
    extensionID: string,
    preloadedResources: Record<string, string>,
    loadingPageURL: string,
) {
    loadingPageURL = new URL(loadingPageURL, 'holoflows-extension://' + extensionID + '/').toJSON()
    writeHTMLScriptElementSrc(extensionID, preloadedResources, loadingPageURL)
    await loadProtocolPageToCurrentPage(extensionID, preloadedResources, loadingPageURL)
}

async function LoadBackgroundScript(
    manifest: Manifest,
    extensionID: string,
    preloadedResources: Record<string, string>,
) {
    if (!manifest.background) return
    const { page, scripts } = (manifest.background as any) as { page: string; scripts: string[] }
    if (!isDebug && location.protocol !== 'holoflows-extension:') {
        throw new TypeError(`Background script only allowed in localhost(for debugging) and holoflows-extension://`)
    }
    let currentPage = 'holoflows-extension://' + extensionID + '/_generated_background_page.html'
    if (page) {
        if (scripts && scripts.length)
            throw new TypeError(`In the manifest, you can't have both "page" and "scripts" for background field!`)
        const pageURL = new URL(page, location.origin)
        if (pageURL.origin !== location.origin)
            throw new TypeError(`You can not specify a foreign origin for the background page`)
        currentPage = 'holoflows-extension://' + extensionID + '/' + pageURL
    }
    writeHTMLScriptElementSrc(extensionID, preloadedResources, currentPage)
    if (page) {
        await loadProtocolPageToCurrentPage(extensionID, preloadedResources, page)
        const div = document.createElement('div')
        div.innerHTML = `
<style>body{background: black; color: white;font-family: system-ui;}</style>
This page is in the debug mode of WebExtension-polyfill<br />
It's running in the background page mode`
        document.body.appendChild(div)
    } else {
        for (const path of (scripts as string[]) || []) {
            const preloaded = await getResourceAsync(extensionID, preloadedResources, path)
            if (preloaded) {
                // ? Run it in global scope.
                RunInProtocolScope(extensionID, preloaded, currentPage)
            } else {
                console.error(`[WebExtension] Background scripts not found for ${manifest.name}: ${path}`)
            }
        }
    }
}

async function loadProtocolPageToCurrentPage(
    extensionID: string,
    preloadedResources: Record<string, string>,
    page: string,
) {
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
        for (const c of document.head.children) c.remove()
        for (const c of dom.head.children) document.head.appendChild(c)
        for (const c of document.body.children) c.remove()
        for (const c of dom.body.children) document.body.appendChild(c)
        for (const [path, script] of scripts) {
            if (script)
                RunInProtocolScope(
                    extensionID,
                    script,
                    new URL(page, 'holoflows-extension://' + extensionID + '/').toJSON(),
                )
            else console.error('Resource', path, 'not found')
        }
    } else {
        const parser = new DOMParser()
        const dom = parser.parseFromString(html, 'text/html')
        for (const c of document.head.children) c.remove()
        for (const c of dom.head.children) document.head.appendChild(c)
        for (const c of document.body.children) c.remove()
        for (const c of dom.body.children) document.body.appendChild(c)
    }
}

function prepareExtensionProtocolEnvironment(extensionID: string, manifest: Manifest) {
    rewriteWorker(extensionID)
    Object.assign(window, {
        browser: BrowserFactory(extensionID, manifest),
        fetch: createFetch(extensionID, window.fetch),
        URL: enhanceURL(URL, extensionID),
        open: openEnhanced(extensionID),
        close: closeEnhanced(extensionID),
    } as Partial<typeof globalThis>)
}

export function RunInProtocolScope(extensionID: string, source: string, currentPage: string): void {
    if (location.protocol === 'holoflows-extension:') {
        const likeESModule = source.match('import') || source.match('export ')
        const script = document.createElement('script')
        script.type = likeESModule ? 'module' : 'text/javascript'
        script.innerText = source
        return
    }
    if (source.indexOf('browser')) {
        const indirectEval = Math.random() > -1 ? eval : () => {}
        const f = indirectEval(`(function(_){with(_){${source}}})`)
        const _ = (x: keyof typeof Reflect) => (target: any, ...any: any[]) =>
            Reflect.apply(Reflect[x], null, [window, ...any])
        const safeGetOwnPropertyDescriptor = (obj: any, key: any) => {
            const orig = Reflect.getOwnPropertyDescriptor(obj, key)
            if (!orig) return undefined
            return { ...orig, configurable: true }
        }
        const globalProxyTrap = new Proxy(
            {
                get(target: any, key: any) {
                    if (key === 'window') return globalProxy
                    if (key === 'globalThis') return globalProxy
                    if (key === 'location') return locationProxy
                    const obj = window[key] as any
                    if (typeof obj === 'function') {
                        const desc2 = Object.getOwnPropertyDescriptors(obj)
                        function f(...args: any[]) {
                            if (new.target) return Reflect.construct(obj, args, new.target)
                            return Reflect.apply(obj, window, args)
                        }
                        Object.defineProperties(f, desc2)
                        Object.setPrototypeOf(f, Object.getPrototypeOf(obj))
                        return f
                    }
                    return obj
                },
                getOwnPropertyDescriptor: safeGetOwnPropertyDescriptor,
            } as ProxyHandler<any>,
            {
                get(target: any, key: any) {
                    if (target[key]) return target[key]
                    return _(key)
                },
            },
        )
        const globalProxy: typeof window = new Proxy({}, globalProxyTrap) as any
        const locationProxy = new Proxy(
            {},
            {
                get(target: Location, key: keyof Location) {
                    target = location
                    const obj = target[key] as any
                    if (key === 'reload') return () => target.reload()
                    if (key === 'assign' || key === 'replace')
                        return (url: string) => {
                            locationProxy.href = url
                        }
                    const mockedURL = new URL(new URLSearchParams(target.search).get('url') || currentPage)
                    if (key in mockedURL) return mockedURL[key as keyof URL]
                    console.warn('Accessing', key, 'on location')
                    return obj
                },
                set(target: Location, key: keyof Location, value: any) {
                    target = location
                    if (key === 'origin') return false
                    const mockedURL = new URL(new URLSearchParams(target.search).get('url') || currentPage)
                    if (key in mockedURL) {
                        if (!Reflect.set(mockedURL, key, value)) return false
                        const search = new URLSearchParams(target.search)
                        search.set('url', mockedURL.toJSON())
                        target.search = search.toString()
                        return true
                    }
                    console.warn('Setting', key, 'on location to', value)
                    return Reflect.set(target, key, value)
                },
                getOwnPropertyDescriptor: safeGetOwnPropertyDescriptor,
            },
        )
        f(globalProxy)
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
