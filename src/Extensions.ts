import { matchingURL } from './utils/URLMatcher'
import { WebExtensionContentScriptEnvironment } from './shims/XRayVision'
import { BrowserFactory } from './shims/browser'
import { createFetch } from './shims/fetch'
import { enhanceURL } from './shims/URL.create+revokeObjectURL'
import { openEnhanced, closeEnhanced } from './shims/window.open+close'
import { getResourceAsync } from './utils/Resources'
import { EventPools } from './utils/LocalMessages'
import { reservedID, useInternalStorage } from './internal'
import { isDebug, parseDebugModeURL } from './debugger/isDebugMode'
import { writeHTMLScriptElementSrc } from './hijacks/HTMLScript.prototype.src'
import { rewriteWorker } from './hijacks/Worker.prototype.constructor'
import { createLocationProxy } from './hijacks/location'

export type WebExtensionID = string
export type Manifest = Partial<browser.runtime.Manifest> &
    Pick<browser.runtime.Manifest, 'name' | 'version' | 'manifest_version'>
export interface WebExtension {
    manifest: Manifest
    environment: WebExtensionContentScriptEnvironment
    preloadedResources: Record<string, string>
}
export const registeredWebExtension = new Map<WebExtensionID, WebExtension>()
export enum Environment {
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
    let debugModeURL = ''
    if (isDebug) {
        const opt = parseDebugModeURL(extensionID, manifest)
        environment = opt.env
        debugModeURL = opt.src
    }
    console.debug(
        `[WebExtension] Loading extension ${manifest.name}(${extensionID}) with manifest`,
        manifest,
        `and preloaded resource`,
        preloadedResources,
        `in ${environment} mode`,
    )
    try {
        switch (environment) {
            case Environment.debugModeManagedPage:
                if (!isDebug) throw new TypeError('Invalid state')
                LoadContentScript(manifest, extensionID, preloadedResources, debugModeURL)
                break
            case Environment.protocolPage:
                prepareExtensionProtocolEnvironment(extensionID, manifest)
                if (isDebug) LoadProtocolPage(extensionID, manifest, preloadedResources, debugModeURL)
                break
            case Environment.backgroundScript:
                prepareExtensionProtocolEnvironment(extensionID, manifest)
                await untilDocumentReady()
                await LoadBackgroundScript(manifest, extensionID, preloadedResources)
                break
            case Environment.contentScript:
                createContentScriptEnvironment(manifest, extensionID, preloadedResources, debugModeURL)
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
                    type callback = typeof browser.runtime.onInstalled.addListener extends (...args: infer T) => any
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
    } else {
        environment = Environment.contentScript
    }
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
    manifest: Manifest,
    preloadedResources: Record<string, string>,
    loadingPageURL: string,
) {
    loadingPageURL = new URL(loadingPageURL, 'holoflows-extension://' + extensionID + '/').toJSON()
    writeHTMLScriptElementSrc(extensionID, manifest, preloadedResources, loadingPageURL)
    await loadProtocolPageToCurrentPage(extensionID, manifest, preloadedResources, loadingPageURL)
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
        currentPage = 'holoflows-extension://' + extensionID + '/' + page
    }
    writeHTMLScriptElementSrc(extensionID, manifest, preloadedResources, currentPage)
    if (page) {
        if (currentPage !== location.href) {
            await loadProtocolPageToCurrentPage(extensionID, manifest, preloadedResources, page)
            const div = document.createElement('div')
            if (isDebug) {
                div.innerHTML = `
<style>body{background: black; color: white;font-family: system-ui;}</style>
This page is in the debug mode of WebExtension-polyfill<br />
It's running in the background page mode`
                document.body.appendChild(div)
            }
        }
    } else {
        for (const path of (scripts as string[]) || []) {
            const preloaded = await getResourceAsync(extensionID, preloadedResources, path)
            if (preloaded) {
                // ? Run it in global scope.
                RunInProtocolScope(extensionID, manifest, preloaded, currentPage)
            } else {
                console.error(`[WebExtension] Background scripts not found for ${manifest.name}: ${path}`)
            }
        }
    }
}

async function loadProtocolPageToCurrentPage(
    extensionID: string,
    manifest: Manifest,
    preloadedResources: Record<string, string>,
    page: string,
) {
    const html = await getResourceAsync(extensionID, preloadedResources, page)
    if (!html) throw new TypeError('Cannot find background page.')
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
                manifest,
                script,
                new URL(page, 'holoflows-extension://' + extensionID + '/').toJSON(),
            )
        else console.error('Resource', path, 'not found')
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

/**
 * Run code in holoflows-extension://extensionID/path
 * @param extensionID Extension ID
 * @param manifest Manifest
 * @param source Source code
 * @param currentPage Current page URL
 */
export function RunInProtocolScope(extensionID: string, manifest: Manifest, source: string, currentPage: string): void {
    const esModuleLike = source.match('import') || source.match('export ')
    if (location.protocol === 'holoflows-extension:' || esModuleLike) {
        return runDirectly(source)
    }
    if (!isDebug) throw new TypeError('Run in the wrong scope')
    if (source.indexOf('location')) {
        const indirectEval = Math.random() > -1 ? eval : () => {}
        const f = indirectEval(`(function(_){with(_){${source}}})`)
        const _ = (x: keyof typeof Reflect) => (target: any, ...any: any[]) =>
            Reflect.apply(Reflect[x], null, [window, ...any])
        const safeGetOwnPropertyDescriptor = (obj: any, key: any) => {
            const orig = Reflect.getOwnPropertyDescriptor(obj, key)
            if (!orig) return undefined
            return { ...orig, configurable: true }
        }
        const { env, src } = parseDebugModeURL(extensionID, manifest)
        const locationProxy = createLocationProxy(extensionID, manifest, currentPage || src)
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
        f(globalProxy)
    } else {
        return runDirectly(source)
    }
    function runDirectly(source: string) {
        if (isDebug) {
            const base = document.createElement('base')
            base.href = '/extension/' + extensionID + '/'
            document.head.appendChild(base)
            console.log('ESModule transform is not implemented yet.')
        }
        const script = document.createElement('script')
        script.type = esModuleLike ? 'module' : 'text/javascript'
        script.innerHTML = source
        script.defer = true
        document.body.appendChild(script)
        return
    }
}
function createContentScriptEnvironment(
    manifest: Manifest,
    extensionID: string,
    preloadedResources: Record<string, string>,
    debugModePretendedURL?: string,
) {
    if (!registeredWebExtension.has(extensionID)) {
        const environment = new WebExtensionContentScriptEnvironment(extensionID, manifest)
        if (debugModePretendedURL)
            environment.global.location = createLocationProxy(extensionID, manifest, debugModePretendedURL)
        const ext: WebExtension = {
            manifest,
            environment,
            preloadedResources,
        }
        registeredWebExtension.set(extensionID, ext)
    }
}
async function LoadContentScript(
    manifest: Manifest,
    extensionID: string,
    preloadedResources: Record<string, string>,
    debugModePretendedURL?: string,
) {
    if (!isDebug && debugModePretendedURL) throw new TypeError('Invalid state')
    if (isDebug) {
        document.body.innerHTML = `
<style>body{background: black; color: white;font-family: system-ui;}</style>
<div>This page is running in the debug mode of WebExtension polyfill</div>
<div>It now pretending to be ${debugModePretendedURL}</div>
<div>So your content script will inject into this page.</div>
<hr />
Copy and apply the webpage to debug your content script:

<textarea id="a"></textarea>
<br />
<button onclick="
var p = new DOMParser();
var dom = p.parseFromString(document.getElementById('a').value, 'text/html');
dom.querySelectorAll('script').forEach(x => x.remove());
var x = new XMLSerializer();
var html = x.serializeToString(dom);
document.write(html);">Remove script tags and go</button>
`
    }
    for (const [index, content] of (manifest.content_scripts || []).entries()) {
        warningNotImplementedItem(content, index)
        if (
            matchingURL(
                new URL(debugModePretendedURL || location.href),
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
    preloadedResources: Record<string, string>,
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
