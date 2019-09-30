/**
 * how webextension-shim communicate with native code.
 */
/// <reference path="../../node_modules/web-ext-types/global/index.d.ts" />
import { AsyncCall } from 'async-call-rpc'
import { dispatchNormalEvent, TwoWayMessagePromiseResolver } from '../utils/LocalMessages'
import { InternalMessage, onNormalMessage } from '../shims/browser.message'
import { isDebug } from '../debugger/isDebugMode'
import { reservedID } from '../internal'
import { internalRPCChannel } from './internal-rpc'
import { SamePageDebugChannel } from './SamePageDebugChannel'

/** Define Blob type in communicate with remote */
export type FrameworkStringOrBlob =
    | {
          type: 'text'
          content: string
      }
    | {
          type: 'array buffer'
          content: string
      }
    | {
          type: 'blob'
          content: string
          mimeType: string
      }
/**
 * This describes what JSONRPC calls that Native side should implement
 */
export interface FrameworkImplementation {
    //#region // ? URL.*
    /**
     * Host should save the binding with `uuid` and the `data`
     * @param extensionID
     * @param UUID - UUID generated by JS side.
     * @param data - data of this object. Must be type `blob`
     */
    'URL.createObjectURL'(extensionID: string, UUID: string, data: FrameworkStringOrBlob): Promise<void>
    /**
     * Host should release the binding with `uuid` and the `data`
     * @param extensionID
     * @param UUID - UUID generated by JS side.
     */
    'URL.revokeObjectURL'(extensionID: string, UUID: string): Promise<void>
    //#endregion
    //#region // ? browser.downloads
    /**
     * Open a dialog, share the file to somewhere else.
     * @param extensionID
     * @param options - See https://mdn.io/browser.downloads.download
     */
    'browser.downloads.download'(
        extensionID: string,
        options: {
            filename: string
            /** Could be a string return by URL.createObjectURL() */
            url: string
        },
    ): Promise<void>
    //#endregion
    //#region // ? browser.storage.local.get
    /**
     * Return the internal storage for `extensionID`
     * @param extensionID
     * @param key
     *
     * @example
     * > Storage: { a: { value: 2 }, b: { name: "x" }, c: 1 }
     *
     * get(id, 'b')
     * > Return {name: "x"}
     *
     * get(id, null)
     * > Return: { a: { value: 2 }, b: { name: "x" }, c: 1 }
     *
     * get(id, ["a", "b"])
     * > Return: { a: { value: 2 }, b: { name: "x" } }
     */
    'browser.storage.local.get'(extensionID: string, key: string | string[] | null): Promise<object>
    /**
     * Host should set the object with 1 layer merging.
     * @param extensionID
     * @param object
     *
     * @example
     * > Storage: `{}`
     * set(id, { a: { value: 1 }, b: { name: "x" } })
     * > Storage: `{ a: { value: 1 }, b: { name: "x" } }`
     * set(id, { a: { value: 2 } })
     * > Storage: `{ a: { value: 2 }, b: { name: "x" } }`
     */
    'browser.storage.local.set'(extensionID: string, object: object): Promise<void>
    /**
     * Remove keys in the object
     * @param extensionID
     * @param key
     */
    'browser.storage.local.remove'(extensionID: string, key: string | string[]): Promise<void>
    /**
     * Delete the internal storage
     * @param extensionID
     */
    'browser.storage.local.clear'(extensionID: string): Promise<void>
    //#endregion
    //#region // ? browser.tabs
    /**
     * Host should create a new tab
     * @param extensionID
     * @param options - See https://mdn.io/browser.tabs.create
     */
    'browser.tabs.create'(extensionID: string, options: { active?: boolean; url?: string }): Promise<browser.tabs.Tab>
    /**
     * Host should remove the tab
     * @param extensionID
     * @param tabId - See https://mdn.io/browser.tabs.remove
     */
    'browser.tabs.remove'(extensionID: string, tabId: number): Promise<void>
    /**
     * Query opened tabs
     * @param extensionID
     * @param options - See https://mdn.io/browser.tabs.query
     */
    'browser.tabs.query'(
        extensionID: string,
        queryInfo: Parameters<typeof browser.tabs.query>[0],
    ): Promise<browser.tabs.Tab[]>
    /**
     * Update a tab's property
     * @param extensionID
     * @param tabId If it is undefined, ignore this request
     * @param updateProperties
     */
    'browser.tabs.update'(
        extensionID: string,
        tabId?: number,
        updateProperties?: {
            url?: string
        },
    ): Promise<browser.tabs.Tab>
    //#endregion
    //#region // ? Message
    /**
     * Used to implement browser.runtime.onMessage and browser.tabs.onMessage
     * @param extensionID - Who send this message
     * @param toExtensionID - Who will receive this message
     * @param tabId - Send this message to tab id
     * @param messageID - A random id generated by client
     * @param message - message object
     */
    sendMessage(
        extensionID: string,
        toExtensionID: string,
        tabId: number | null,
        messageID: string,
        message: InternalMessage,
    ): Promise<void>
    //#endregion
    //#region // ? fetch // ? (to bypass cross origin restriction)
    /**
     * See: https://mdn.io/fetch
     * @param extensionID
     * @param request - The request object
     */
    fetch(
        extensionID: string,
        request: {
            /** GET, POST, .... */
            method: string
            url: string
        },
    ): Promise<{
        /** response code */
        status: number
        /** response text */
        statusText: string
        data: FrameworkStringOrBlob
    }>
    //#endregion
}
/**
 * This describes what JSONRPC calls that JS side should implement
 */
export interface FrameworkMayInvokeMethods {
    /**
     * Host call this to notify `browser.webNavigation.onCommitted` happened.
     *
     * @see https://mdn.io/browser.webNavigation.onCommitted
     * @param tab - The committed tab info
     */
    'browser.webNavigation.onCommitted'(tab: { tabId: number; url: string }): Promise<void>
    'browser.webNavigation.onDOMContentLoaded'(tab: { tabId: number; url: string }): Promise<void>
    'browser.webNavigation.onCompleted'(tab: { tabId: number; url: string }): Promise<void>
    /**
     * Used to implement browser.runtime.onMessage and browser.tabs.onMessage
     * @param extensionID - Who send this message
     * @param toExtensionID - Who will receive this message
     * @param messageID - A random id created by the sender. Used to identify if the message is a response.
     * @param message - Send by another client
     * @param sender - Info of the sender
     */
    onMessage(
        extensionID: string,
        toExtensionID: string,
        messageID: string,
        message: InternalMessage,
        sender: browser.runtime.MessageSender,
    ): Promise<void>
}

const key = 'holoflowsjsonrpc'
class iOSWebkitChannel {
    constructor() {
        document.addEventListener(key, e => {
            const detail = (e as CustomEvent<any>).detail
            for (const f of this.listener) {
                try {
                    f(detail)
                } catch {}
            }
        })
    }
    private listener: Array<(data: unknown) => void> = []
    on(_: string, cb: (data: any) => void): void {
        this.listener.push(cb)
    }
    emit(_: string, data: any): void {
        if (isDebug) {
            console.log('send', data)
        }
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers[key])
            window.webkit.messageHandlers[key].postMessage(data)
    }
}
export const ThisSideImplementation: FrameworkMayInvokeMethods = {
    // todo: check dispatch target's manifest
    'browser.webNavigation.onCommitted': dispatchNormalEvent.bind(null, 'browser.webNavigation.onCommitted', '*'),
    'browser.webNavigation.onDOMContentLoaded': dispatchNormalEvent.bind(
        null,
        'browser.webNavigation.onDOMContentLoaded',
        '*',
    ),
    'browser.webNavigation.onCompleted': dispatchNormalEvent.bind(null, 'browser.webNavigation.onCompleted', '*'),
    async onMessage(extensionID, toExtensionID, messageID, message, sender) {
        switch (message.type) {
            case 'internal-rpc':
                internalRPCChannel.onReceiveMessage('', message.message)
                break
            case 'message':
                // ? this is a response to the message
                if (TwoWayMessagePromiseResolver.has(messageID) && message.response) {
                    const [resolve, reject] = TwoWayMessagePromiseResolver.get(messageID)!
                    resolve(message.data)
                    TwoWayMessagePromiseResolver.delete(messageID)
                } else if (message.response === false) {
                    onNormalMessage(message.data, sender, toExtensionID, extensionID, messageID)
                } else {
                    // ? drop the message
                }
                break
            case 'onWebNavigationChanged':
                if (!sender.tab || sender.tab.id === undefined) break
                const param = {
                    tabId: sender.tab.id,
                    url: message.location,
                }
                switch (message.status) {
                    case 'onCommitted':
                        ThisSideImplementation['browser.webNavigation.onCommitted'](param)
                        break
                    case 'onCompleted':
                        ThisSideImplementation['browser.webNavigation.onCompleted'](param)
                        break
                    case 'onDOMContentLoaded':
                        ThisSideImplementation['browser.webNavigation.onDOMContentLoaded'](param)
                        break
                    case 'onHistoryStateUpdated':
                        // TODO: not implemented
                        break
                }
                break
            default:
                break
        }
    },
}

export const FrameworkRPC = AsyncCall<FrameworkImplementation>(ThisSideImplementation as any, {
    key: '',
    log: false,
    messageChannel: isDebug ? new SamePageDebugChannel('client') : new iOSWebkitChannel(),
})

if (location.protocol !== 'holoflows-extension') {
    FrameworkRPC.sendMessage(reservedID, reservedID, null, Math.random() + '', {
        type: 'onWebNavigationChanged',
        status: 'onCommitted',
        location: location.href,
    })
    if (typeof window === 'object') {
        window.addEventListener('DOMContentLoaded', () => {
            FrameworkRPC.sendMessage(reservedID, reservedID, null, Math.random() + '', {
                type: 'onWebNavigationChanged',
                status: 'onDOMContentLoaded',
                location: location.href,
            })
        })
        window.addEventListener('load', () => {
            FrameworkRPC.sendMessage(reservedID, reservedID, null, Math.random() + '', {
                type: 'onWebNavigationChanged',
                status: 'onCompleted',
                location: location.href,
            })
        })
        // TODO: implements onHistoryStateUpdated event.
    }
}
