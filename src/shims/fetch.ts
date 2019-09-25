import { Host } from '../RPC'
import { decodeStringOrBlob } from '../utils/StringOrBlob'
import { debugModeURLRewrite } from '../debugger/url-rewrite'
import { isDebug } from '../debugger/isDebugMode'

export function createFetch(extensionID: string, origFetch: typeof fetch): typeof fetch {
    return new Proxy(origFetch, {
        async apply(origFetch, thisArg, [requestInfo, requestInit]: Parameters<typeof fetch>) {
            const request = new Request(requestInfo, requestInit)
            const url = new URL(request.url)
            // Debug mode
            if (isDebug && (url.origin === location.origin || url.protocol === 'holoflows-extension:')) {
                return origFetch(debugModeURLRewrite(extensionID, request.url), requestInit)
            } else if (request.url.startsWith('holoflows-extension://' + extensionID + '/')) {
                return origFetch(requestInfo, requestInit)
            } else {
                const result = await Host.fetch(extensionID, { method: request.method, url: url.toJSON() })
                const data = decodeStringOrBlob(result.data)
                if (data === null) throw new Error('')
                const returnValue = new Response(data, result)
                return returnValue
            }
        },
    })
}
