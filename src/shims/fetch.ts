import { Host } from '../RPC'
import { decodeStringOrBlob } from '../utils/StringOrBlob'

export function createFetch(extensionID: string): typeof fetch {
    return new Proxy(fetch, {
        async apply(target, thisArg, [requestInfo, requestInit]: Parameters<typeof fetch>) {
            const request = new Request(requestInfo, requestInit)
            const result = await Host.fetch(extensionID, request)
            const data = await decodeStringOrBlob(result.data)
            if (data === null) throw new Error('')
            const returnValue = new Response(data, result)
            return returnValue
        },
    })
}
