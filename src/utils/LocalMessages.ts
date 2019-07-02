import { Host } from '../RPC'
type WebExtensionID = string
type webNavigationOnCommittedArgs = Parameters<Host['browser.webNavigation.onCommitted']>
type onMessageArgs = Parameters<Host['onMessage']>
type PoolKeys = 'browser.webNavigation.onCommitted'
const EventPools: Record<PoolKeys, Map<WebExtensionID, Set<Function>>> = {
    'browser.webNavigation.onCommitted': new Map(),
}
export async function dispatch(event: PoolKeys, ...args: any[]) {
    if (!EventPools[event]) return
    for (const [o, f] of EventPools[event].entries()) {
        for (const fs of f) {
            try {
                fs(...args)
            } catch (e) {
                console.error(e)
            }
        }
    }
}
Object.assign(window, { dispatch })
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
