import { registerWebExtension } from './Extensions'
import { WebExtensionContentScriptEnvironment } from './shims/XRayVision'
import './debugger/localhost'
import { isDebug } from './debugger/isDebugMode'
// ## Inject here

if (isDebug) {
    // leaves your id here, and put your extension to /extension/{id}/
    const testIDs = ['eofkdgkhfoebecmamljfaepckoecjhib']
    testIDs.forEach(id =>
        fetch('/extension/' + id + '/manifest.json')
            .then(x => x.text())
            .then(x => {
                console.log('Loading test WebExtension')
                Object.assign({
                    a: registerWebExtension,
                    b: WebExtensionContentScriptEnvironment,
                    c: registerWebExtension(id, JSON.parse(x)),
                })
            }),
    )
}

/**
 * registerWebExtension(
 *      extensionID: string,
 *      manifest: Manifest,
 *      preloadedResources?: Record<string, string>
 * )
 */
