import { registerWebExtension } from './Extensions'
import { WebExtensionManagedRealm } from './shims/XRayVision'
import './debugger/localhost'
import { isDebug } from './debugger/isDebugMode'

// Note: We actually load it as a extern dependency.
// So we remove them after we got it.
import Realm from 'realms-shim'
import ts from 'typescript'
console.log('Loading dependencies from external', Realm, ts)

// ## Inject here

if (isDebug) {
    // leaves your id here, and put your extension to /extension/{id}/
    // const testIDs = ['eofkdgkhfoebecmamljfaepckoecjhib']
    const testIDs = ['griesruigerhuigreuijghrehgerhgerge']
    testIDs.forEach(id =>
        fetch('/extension/' + id + '/manifest.json')
            .then(x => x.text())
            .then(x => {
                console.log(`Loading test WebExtension ${id}. Use globalThis.exts to access env`)
                Object.assign(globalThis, {
                    registerWebExtension,
                    WebExtensionManagedRealm,
                })
                return registerWebExtension(id, JSON.parse(x))
            })
            .then(v => Object.assign(globalThis, { exts: v })),
    )
} else {
    // @ts-ignore
    delete globalThis.ts
    // @ts-ignore
    delete globalThis.TypeScript
    // @ts-ignore
    delete globalThis.Realm
}

/**
 * registerWebExtension(
 *      extensionID: string,
 *      manifest: Manifest,
 *      preloadedResources?: Record<string, string>
 * )
 */
