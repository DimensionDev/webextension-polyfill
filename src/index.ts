import { registerWebExtension } from './Extensions'
import Manifest from './extension/manifest.json'
// @ts-ignore
import ContentScript from './extension/js/contentscript.js'
// @ts-ignore
import ContentScriptMap from './extension/js/contentscript.js.map'

const contentScripts = {
    'js/contentscript.js': ContentScript + '\n//# sourceMappingURL=data:application/json,' + ContentScriptMap,
}
registerWebExtension('eofkdgkhfoebecmamljfaepckoecjhib', JSON.parse(Manifest as any), contentScripts)
