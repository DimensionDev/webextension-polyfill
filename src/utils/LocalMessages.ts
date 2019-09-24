import { ThisSideImplementation } from '../RPC'
type WebExtensionID = string
type MessageID = string
type webNavigationOnCommittedArgs = Parameters<ThisSideImplementation['browser.webNavigation.onCommitted']>
type onMessageArgs = Parameters<ThisSideImplementation['onMessage']>
type PoolKeys = 'browser.webNavigation.onCommitted' | 'browser.runtime.onMessage' | 'browser.runtime.onInstall'
/**
 * Used for keep reference to browser.runtime.onMessage
 */
export const TwoWayMessagePromiseResolver = new Map<MessageID, [(val: any) => any, (val: any) => any]>()
/**
 * To store listener for Host dispatched events.
 */
export const EventPools: Record<PoolKeys, Map<WebExtensionID, Set<(...args: any[]) => any>>> = {
    'browser.webNavigation.onCommitted': new Map(),
    'browser.runtime.onMessage': new Map(),
    'browser.runtime.onInstall': new Map(),
}
/**
 * Dispatch a normal event (that not have a "response").
 * Like browser.webNavigation.onCommitted
 */
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
/**
 * Create a `EventObject<ListenerType>` object.
 *
 * Can be set on browser.webNavigation.onCommitted etc...
 */
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
