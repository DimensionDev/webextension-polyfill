import { Host } from '../../dist/RPC'

export function createFetch(extensionID: string): typeof fetch {
    return new Proxy(fetch, {
        apply(target, thisArg, [requestInfo, requestInit]: Parameters<typeof fetch>) {
            return Host
        },
    })
}
