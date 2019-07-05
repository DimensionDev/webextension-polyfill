import { registerWebExtension } from './Extensions'
import { WebExtensionContentScriptEnvironment } from './shims/XRayVision'
Object.assign(window, { registerWebExtension, WebExtensionContentScriptEnvironment })
