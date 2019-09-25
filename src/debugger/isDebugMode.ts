import { Environment, Manifest } from '../Extensions'

export const isDebug = location.hostname === 'localhost'
export function parseDebugModeURL(
    extensionID: string,
    manifest: Manifest,
):
    | { env: Environment.backgroundScript; src: '' }
    | { env: Environment.debugModeManagedPage | Environment.protocolPage; src: string } {
    const param = new URLSearchParams(location.search)
    const type = param.get('type')
    let src = param.get('url')
    const base = 'holoflows-extension://' + extensionID + '/'
    if (src === '_options_') src = new URL(manifest.options_ui!.page, base).toJSON()
    if (src === '_popup_') src = new URL(manifest.browser_action!.default_popup!, base).toJSON()
    if (type === 'b') return { env: Environment.backgroundScript, src: '' }
    if (!src) throw new TypeError('Need a url')
    if (type === 'p') return { env: Environment.protocolPage, src }
    else if (type === 'm') return { env: Environment.debugModeManagedPage, src }
    else
        throw new TypeError(
            'To debug, ?type= must be one of (b)ackground, (p)rotocol-page, (m)anaged-page (used to debug content script), found ' +
                type,
        )
}
