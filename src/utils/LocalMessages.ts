type WebExtensionID = string
type MessageID = string
type PoolKeys = keyof typeof EventPools
/**
 * Used for keep reference to browser.runtime.onMessage
 */
export const TwoWayMessagePromiseResolver = new Map<MessageID, [(val: any) => any, (val: any) => any]>()
type EventPool = Map<WebExtensionID, Set<(...args: any[]) => any>>
type PortID = string
/**
 * To store listener for Host dispatched events.
 */
export const EventPools = {
    'browser.webNavigation.onCommitted': new Map() as EventPool,
    'browser.webNavigation.onDOMContentLoaded': new Map() as EventPool,
    'browser.webNavigation.onCompleted': new Map() as EventPool,
    'browser.runtime.onMessage': new Map() as EventPool,
    'browser.runtime.onInstall': new Map() as EventPool,
    'browser.runtime.onConnect': new Map() as EventPool,
    'browser.runtime.onConnect:Port:onMessage': new Map<PortID, Set<(...args: any[]) => any>>(),
    'browser.runtime.onConnect:Port:onDisconnect': new Map<PortID, Set<(...args: any[]) => any>>(),
} as const
/**
 * Dispatch a normal event (that not have a "response").
 * Like browser.webNavigation.onCommitted
 */
export async function dispatchNormalEvent<T extends any[]>(
    event: PoolKeys,
    toExtensionID: string | string[] | '*',
    ...args: T
) {
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
export async function dispatchPortEvent(event: 'disconnected' | 'message', toPortID: string, message: unknown) {
    const pool =
        event === 'message'
            ? EventPools['browser.runtime.onConnect:Port:onMessage']
            : EventPools['browser.runtime.onConnect:Port:onDisconnect']
    if (!pool) return
    const portID = 'port://' + toPortID
    const fns = pool.get(portID)
    if (!fns) return
    for (const f of fns) {
        try {
            f(message)
        } catch (e) {
            console.error(e)
        }
    }
}
export function createPortListener(portID: PortID, event: 'disconnected' | 'message') {
    return createEventListener(
        'port://' + portID,
        event === 'disconnected'
            ? 'browser.runtime.onConnect:Port:onDisconnect'
            : 'browser.runtime.onConnect:Port:onMessage',
    )
}
export function clearPortListener(portID: PortID) {
    EventPools['browser.runtime.onConnect:Port:onDisconnect'].delete('port://' + portID)
    EventPools['browser.runtime.onConnect:Port:onMessage'].delete('port://' + portID)
}
/**
 * Create a `EventObject<ListenerType>` object.
 *
 * Can be set on browser.webNavigation.onCommitted etc...
 */
export function createEventListener(extensionID: WebExtensionID, event: PoolKeys) {
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
