import { isDebug } from './isDebugMode'

export function debugModeURLRewrite(extensionID: string, url: string): string {
    if (!isDebug) throw new TypeError('')
    const u = new URL(url, 'holoflows-extension://' + extensionID + '/')
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
