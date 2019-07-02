import { Host } from '../RPC'
type WebExtensionID = string
type MessageID = string
type webNavigationOnCommittedArgs = Parameters<Host['browser.webNavigation.onCommitted']>
type onMessageArgs = Parameters<Host['onMessage']>
type PoolKeys = 'browser.webNavigation.onCommitted' | 'browser.runtime.onMessage'
/**
 * Used for keep reference to browser.runtime.onMessage
 */
export const TwoWayMessagePromiseResolver = new Map<MessageID, [(val: any) => any, (val: any) => any]>()
export const EventPools: Record<PoolKeys, Map<WebExtensionID, Set<(...args: any[]) => any>>> = {
    'browser.webNavigation.onCommitted': new Map(),
    'browser.runtime.onMessage': new Map(),
}
export async function dispatchNormalEvent(event: PoolKeys, toExtensionID: string | string[] | '*', ...args: any[]) {
    if (!EventPools[event]) return
    for (const [extensionID, fns] of EventPools[event].entries()) {
        if (Array.isArray(toExtensionID) && toExtensionID.indexOf(extensionID) === -1) continue
        if (!Array.isArray(toExtensionID) && toExtensionID !== extensionID && toExtensionID !== '*') continue
        for (const f of fns) {
            try {
                f(...args)
            } catch (e) {
                console.error(e)
            }
        }
    }
}
export function createEventListener(extensionID: string, event: PoolKeys) {
    if (!EventPools[event].has(extensionID)) {
        EventPools[event].set(extensionID, new Set())
    }
    const pool = EventPools[event].get(extensionID)!
    const handler: EventObject<(...args: any[]) => any> = {
        addListener(callback) {
            if (typeof callback !== 'function') throw new TypeError('Listener must be function')
            pool.add(callback)
        },
        removeListener(callback) {
            pool.delete(callback)
        },
        hasListener(listener) {
            return pool.has(listener)
        },
    }
    return handler
}

interface EventObject<T extends (...args: any[]) => any> {
    addListener: (callback: T) => void
    removeListener: (listener: T) => void
    hasListener: (listener: T) => boolean
}
