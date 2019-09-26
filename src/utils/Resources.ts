import { isDebug } from '../debugger/isDebugMode'
import { debugModeURLRewrite } from '../debugger/url-rewrite'
import { Host } from '../RPC'
import { decodeStringOrBlob } from './StringOrBlob'

const normalized = Symbol('Normalized resources')
function normalizePath(path: string, extensionID: string) {
    const prefix = getPrefix(extensionID)
    if (path.startsWith(prefix)) return debugModeURLRewrite(extensionID, path)
    else return debugModeURLRewrite(extensionID, new URL(path, prefix).toJSON())
}
function getPrefix(extensionID: string) {
    return 'holoflows-extension://' + extensionID + '/'
}

export function getResource(extensionID: string, resources: Record<string, string>, path: string): string | undefined {
    // Normalization the resources
    // @ts-ignore
    if (!resources[normalized]) {
        for (const key in resources) {
            if (key.startsWith(getPrefix(extensionID))) continue
            const obj = resources[key]
            delete resources[key]
            resources[new URL(key, getPrefix(extensionID)).toJSON()] = obj
        }
        // @ts-ignore
        resources[normalized] = true
    }
    return resources[normalizePath(path, extensionID)]
}

export async function getResourceAsync(extensionID: string, resources: Record<string, string>, path: string) {
    const preloaded = getResource(extensionID, resources, path)
    if (preloaded) return preloaded

    const url = normalizePath(path, extensionID)
    const response = await Host.fetch(extensionID, { method: 'GET', url })
    const result = decodeStringOrBlob(response.data)
    if (result === null) return undefined
    if (typeof result === 'string') return result
    console.error('Not supported type for getResourceAsync')
    return undefined
}
