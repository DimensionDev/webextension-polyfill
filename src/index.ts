import { registerWebExtension } from './Extensions'
import { WebExtensionManagedRealm } from './shims/XRayVision'
import './debugger/localhost'
import { isDebug } from './debugger/isDebugMode'

// Note: We actually load it as a extern dependency.
// So we remove them after we got it.
import ts from 'typescript'
console.log('Loading dependencies from external', ts)

// ## Inject here

if (isDebug) {
    // leaves your id here, and put your extension to /extension/{id}/
    const testIDs = ['eofkdgkhfoebecmamljfaepckoecjhib']
    // const testIDs = ['eofkdgkhfoebecmamljfaepckoecjhib', 'griesruigerhuigreuijghrehgerhgerge']
    // const testIDs = ['griesruigerhuigreuijghrehgerhgerge']
    testIDs.forEach((id) =>
        fetch('/extension/' + id + '/manifest.json')
            .then((x) => x.text())
            .then((x) => registerWebExtension(id, JSON.parse(x))),
    )
} else {
    /** ? Can't delete a global variable */
    Object.assign(globalThis, {
        ts: undefined,
        TypeScript: undefined,
    })
}

/**
 * registerWebExtension(
 *      extensionID: string,
 *      manifest: Manifest,
 *      preloadedResources?: Record<string, string>
 * )
 */
