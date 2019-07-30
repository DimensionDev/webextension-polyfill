import { registerWebExtension } from './Extensions'
const env =
    location.href.startsWith('holoflows-extension://') && location.href.endsWith('_generated_background_page.html')
// ## Inject here
// ? to avoid registerWebExtension omitted by rollup
registerWebExtension.toString()

/**
 * registerWebExtension(
 *      extensionID: string,
 *      manifest: Manifest,
 *      preloadedResources?: Record<string, string>
 * )
 */
