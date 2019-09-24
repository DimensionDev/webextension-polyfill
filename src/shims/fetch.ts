import { Host } from '../RPC'
import { decodeStringOrBlob } from '../utils/StringOrBlob'

export function createFetch(extensionID: string, origFetch: typeof fetch): typeof fetch {
    return new Proxy(fetch, {
        async apply(target, thisArg, [requestInfo, requestInit]: Parameters<typeof fetch>) {
            const { method, url } = new Request(requestInfo, requestInit)
            if (url.startsWith('holoflows-extension://' + extensionID + '/')) {
                const u = new URL(url)
                if (u.protocol === 'holoflows-extension:' && location.hostname === 'localhost') {
                    const redir = u.pathname.replace('//' + extensionID + '/', '/extension/') + u.search
                    console.debug('fetching', requestInfo, 'redirecting to', redir)
                    return origFetch(redir, requestInit)
                }
                return origFetch(requestInfo, requestInit)
            } else {
                const result = await Host.fetch(extensionID, { method, url })
                const data = await decodeStringOrBlob(result.data)
                if (data === null) throw new Error('')
                const returnValue = new Response(data, result)
                return returnValue
            }
        },
    })
}
