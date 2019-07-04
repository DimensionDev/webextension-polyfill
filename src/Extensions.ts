import { matchingURL } from './utils/URLMatcher'
import { WebExtensionContentScriptEnvironment } from './shims/XRayVision'

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
        } else {
            console.warn(`[WebExtension] unknown running environment ${environment}`)
        }
    } catch (e) {
        console.error(e)
    }
    return registeredWebExtension.get(extensionID)
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
