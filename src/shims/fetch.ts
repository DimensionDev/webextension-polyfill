import { Host } from '../RPC'
import { decodeStringOrBlob } from '../utils/StringOrBlob'

export function createFetch(extensionID: string, origFetch: typeof fetch): typeof fetch {
    return new Proxy(fetch, {
        async apply(target, thisArg, [requestInfo, requestInit]: Parameters<typeof fetch>) {
            const { method, url } = new Request(requestInfo, requestInit)
            if (url.startsWith('holoflows-extension://' + extensionID + '/')) {
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
