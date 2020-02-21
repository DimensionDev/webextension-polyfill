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
                createContentScriptEnvironment(manifest, extensionID, preloadedResources, debugModeURL)
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
        if (isDebug) throw e
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
                await RunInProtocolScope(extensionID, manifest, { source: preloaded, path }, currentPage, 'script')
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
        Array.from(dom.querySelectorAll('script')).map<Promise<[string, string | undefined, 'script' | 'module']>>(
            async script => {
                const path = new URL(script.src).pathname
                script.remove()
                return [
                    path,
                    await getResourceAsync(extensionID, preloadedResources, path),
                    script.type === 'module' ? 'module' : 'script',
                ]
            },
        ),
    )
    for (const c of document.head.children) c.remove()
    for (const c of dom.head.children) document.head.appendChild(c)
    for (const c of document.body.children) c.remove()
    for (const c of dom.body.children) document.body.appendChild(c)
    for (const [path, script, kind] of scripts) {
        if (script)
            await RunInProtocolScope(
                extensionID,
                manifest,
                { source: script, path },
                new URL(page, 'holoflows-extension://' + extensionID + '/').toJSON(),
                kind,
            )
        else console.error('Resource', path, 'not found')
    }
}

function prepareExtensionProtocolEnvironment(extensionID: string, manifest: Manifest) {
    rewriteWorker(extensionID)
    Object.assign(window, {
        browser: BrowserFactory(extensionID, manifest, Object.prototype),
        fetch: createFetch(extensionID),
        URL: enhanceURL(URL, extensionID),
        open: openEnhanced(extensionID),
        close: closeEnhanced(extensionID),
    } as Partial<typeof globalThis>)
}

/**
 * Run code in holoflows-extension://extensionID/path
 * @param extensionID Extension ID
 * @param manifest Manifest
 * @param code Source code
 * @param currentPage Current page URL
 */
export async function RunInProtocolScope(
    extensionID: string,
    manifest: Manifest,
    code: { source: string; path?: string },
    currentPage: string,
    kind: 'module' | 'script',
): Promise<void> {
    const esModule = kind === 'module'
    if (location.protocol === 'holoflows-extension:') {
        const script = document.createElement('script')
        script.type = esModule ? 'module' : 'text/javascript'
        if (code.path) script.src = code.path
        else script.innerHTML = code.source
        script.defer = true
        document.body.appendChild(script)
        return
    }
    if (!isDebug) throw new TypeError('Run in the wrong scope')

    const { src } = parseDebugModeURL(extensionID, manifest)
    const locationProxy = createLocationProxy(extensionID, manifest, currentPage || src)
    // ? Transform ESM into SystemJS to run in debug mode.
    const _: WebExtensionContentScriptEnvironment =
        Reflect.get(globalThis, 'env') ||
        (console.log('Debug by globalThis.env'),
        new WebExtensionContentScriptEnvironment(extensionID, manifest, locationProxy))
    Object.assign(globalThis, { env: _ })
    if (code.path) {
        if (esModule) await _.evaluateModule(code.path, currentPage)
        else await _.evaluateScript(code.path, currentPage)
    } else {
        if (esModule) await _.evaluateInlineModule(code.source)
        else await _.evaluateInlineScript(code.source)
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
            await environment.evaluateInlineScript(preloaded)
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
