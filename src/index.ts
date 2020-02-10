import { registerWebExtension } from './Extensions'
import { WebExtensionContentScriptEnvironment } from './shims/XRayVision'
import './debugger/localhost'
import { isDebug } from './debugger/isDebugMode'

// Note: We actually load it as a extern dependency.
// So we remove them after we got it.
import Realm from 'realms-shim'
import ts from 'typescript'
console.log('Loading dependencies from external', Realm, ts)
Object.assign(globalThis, { ts: undefined, TypeScript: undefined, Realm: undefined })

// ## Inject here

if (isDebug) {
    // leaves your id here, and put your extension to /extension/{id}/
    const testIDs = ['griesruigerhuigreuijghrehgerhgerge']
    testIDs.forEach(id =>
        fetch('/extension/' + id + '/manifest.json')
            .then(x => x.text())
            .then(x => {
                console.log('Loading test WebExtension')
                Object.assign(globalThis, {
                    a: registerWebExtension,
                    b: WebExtensionContentScriptEnvironment,
                })
                return registerWebExtension(id, JSON.parse(x))
            })
            .then(v => Object.assign(globalThis, { c: v })),
    )
}

/**
 * registerWebExtension(
 *      extensionID: string,
 *      manifest: Manifest,
 *      preloadedResources?: Record<string, string>
 * )
 */
