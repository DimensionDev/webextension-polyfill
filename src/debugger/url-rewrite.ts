import { isDebug } from './isDebugMode'
import { getPrefix } from '../utils/Resources'

export function debugModeURLRewrite(extensionID: string, url: string): string {
    if (!isDebug) return url
    const u = new URL(url, getPrefix(extensionID))
    if (u.protocol === 'holoflows-extension:') {
        u.protocol = location.protocol
        u.host = location.host
        u.pathname = '/extension/' + extensionID + '/' + u.pathname
        console.debug('Rewrited url', url, 'to', u.toJSON())
        return u.toJSON()
    } else if (u.origin === location.origin) {
        if (u.pathname.startsWith('/extension/')) return url
        u.pathname = '/extension/' + extensionID + u.pathname
        console.debug('Rewrited url', url, 'to', u.toJSON())
        return u.toJSON()
    }
    return url
}
