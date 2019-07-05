import { registerWebExtension } from './Extensions'
import Manifest from './extension/manifest.json'

const resources: Record<string, string> = {}
/**
 * Dynamically generate code:
 * for each file in `src/extension/js` and `src/extension/polyfill`
 *   Generate code like this:
 * ```typescript
 * // @ts-ignore
 * import $PATHNAME_FILENAME from './extension/PATHNAME/FILENAME'
 * resources['pathname/filename'] = $PATHNAME_FILENAME
 * ```
 */
'inject point'

const id = 'eofkdgkhfoebecmamljfaepckoecjhib'
const manifest = JSON.parse(Manifest as any)
const env =
    location.href.startsWith('holoflows-extension://') && location.href.endsWith('_generated_background_page.html')
registerWebExtension(id, manifest, env ? 'background script' : 'content script', resources)
