import { FrameworkRPC } from '../RPCs/framework-rpc'
import { decodeStringOrBufferSource, encodeStringOrBufferSource } from '../utils/StringOrBlob'
import { debugModeURLRewrite } from '../debugger/url-rewrite'
import { isDebug } from '../debugger/isDebugMode'
import { getPrefix } from '../utils/Resources'

const origFetch = window.fetch
export function createFetch(extensionID: string): typeof fetch {
    return new Proxy(origFetch, {
        async apply(origFetch, thisArg, [requestInfo, requestInit]: Parameters<typeof fetch>) {
            const request = new Request(requestInfo, requestInit)
            const url = new URL(request.url)
            // Debug mode
            if (isDebug && (url.origin === location.origin || url.protocol === 'holoflows-extension:')) {
                return origFetch(debugModeURLRewrite(extensionID, request.url), requestInit)
            } else if (request.url.startsWith(getPrefix(extensionID))) {
                return origFetch(requestInfo, requestInit)
            } else {
                if (isDebug) return origFetch(requestInfo, requestInit)
                const { method, body } = request
                const result = await FrameworkRPC.fetch(extensionID, {
                    method,
                    url: url.toJSON(),
                    body: await reader(body),
                })
                const data = decodeStringOrBufferSource(result.data)
                if (data === null) throw new Error('')
                const returnValue = new Response(data, result)
                return returnValue
            }
        },
    })
}
async function reader(body: ReadableStream<Uint8Array> | null) {
    if (!body) return null
    const iter = body.getReader()
    const u: Uint8Array[] = []
    for await (const i of read(iter)) u.push(i)
    return encodeStringOrBufferSource(new Uint8Array(flat_iter(u)))
}
function* flat_iter(args: Uint8Array[]) {
    for (const each of args) yield* each
}
async function* read<T>(iter: ReadableStreamDefaultReader<T>) {
    let result: ReadableStreamDefaultReadResult<T> = await iter.read()
    while (!result.done) {
        yield result.value
        result = await iter.read()
    }
}
