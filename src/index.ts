import { registerWebExtension } from './Extensions'
import { WebExtensionContentScriptEnvironment } from './shims/XRayVision'
// ## Inject here

if (location.hostname) {
    fetch('/extension/manifest.json')
        .then(x => x.text())
        .then(x => {
            console.log('Loading test WebExtension')
            Object.assign({
                a: registerWebExtension,
                b: WebExtensionContentScriptEnvironment,
                c: registerWebExtension(
                    Math.random()
                        .toString(36)
                        .slice(2),
                    JSON.parse(x),
                ),
            })
        })
}

/**
 * registerWebExtension(
 *      extensionID: string,
 *      manifest: Manifest,
 *      preloadedResources?: Record<string, string>
 * )
 */
