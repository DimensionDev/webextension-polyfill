/// <reference path="../node_modules/web-ext-types/global/index.d.ts" />
import { AsyncCall } from '@holoflows/kit/es'

export interface Host {
    /**
     * Format like "holoflows-blob://$prefix/$UUID"
     * @param extensionID
     * @param UUID
     * @param blob base64 encoded binary
     * @param type MINE/type "text/html"
     */
    'URL.createObjectURL'(extensionID: string, uuid: string, blob: string, mineType: string): Promise<void>
    /**
     * Open a dialog, share the file to somewhere else.
     * @param extensionID
     * @param options
     */
    'browser.downloads.download'(
        extensionID: string,
        options: {
            filename: string
            /** Could be a string return by URL.createObjectURL() */
            url: string
        },
    ): Promise<void>
    /**
     * @host
     * @param toExtensionID Send this message to
     * @param tab The committed tab info
     */
    'browser.webNavigation.onCommitted'(toExtensionID: string, tab: { tabId: number; url: string }): Promise<void>
    /**
     *
     * @param extensionID
     * @param tabID The tab opened
     * @param details
     */
    'browser.tabs.executeScript'(
        extensionID: string,
        tabID: number,
        details: {
            code?: string
            file?: string
            runAt?: 'document_start' | 'document_end' | 'document_idle'
        },
    ): Promise<void>
    // ! Storage
    /**
     * Return the internal storage for `extensionID`
     * @param extensionID
     * @param key
     *
     * @example
     * > Storage: `{ a: { value: 2 }, b: { name: "x" }, c: 1 }`
     *
     * get(id, 'b')
     * > Return `{name: "x"}`
     *
     * get(id, null)
     * > Return: `{ a: { value: 2 }, b: { name: "x" }, c: 1 }`
     *
     * get(id, ["a", "b"])
     * > Return: `{ a: { value: 2 }, b: { name: "x" } }`
     */
    'browser.storage.local.get'(extensionID: string, key: string | string[] | null): Promise<object>
    /**
     *
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
     *
     * @param extensionID
     * @param key
     */
    'browser.storage.local.remove'(extensionID: string, key: string | string[]): Promise<void>
    /**
     * Delete the internal storage
     * @param extensionID
     */
    'browser.storage.local.clear'(extensionID: string): Promise<void>
    /**
     * Return the bytes of the data
     * @param extensionID
     * @param key
     */
    'browser.storage.local.getBytesInUse'(extensionID: string, key: null | string | string[]): Promise<number>
    // ! tabs
    /**
     *
     * @param options
     */
    'browser.tabs.create'(extensionID: string, options: { active?: boolean; url?: string }): Promise<browser.tabs.Tab>
    /**
     *
     * @param extensionID
     */
    'browser.tabs.remove'(extensionID: string, tabId: number): Promise<void>
    /**
     * Used to implement browser.runtime.onMessage and browser.tabs.onMessage
     * @param extensionID Who send this message
     * @param toExtensionID Who will receive this message
     * @param tabId Send this message to tab id
     * @param messageID A random id generated by client
     * @param message message object
     */
    'sendMessage'(
        extensionID: string,
        toExtensionID: string,
        tabId: number | null,
        messageID: string,
        message: any,
    ): Promise<void>
    /**
     * @host
     * Used to implement browser.runtime.onMessage and browser.tabs.onMessage
     * @param extensionID Who send this message
     * @param toExtensionID Who will receive this message
     * @param messageID A random id created by the sender. Used to identify if the message is a response.
     * @param message Send by another client
     * @param sender Info of the sender
     */
    'onMessage'(
        extensionID: string,
        toExtensionID: string,
        messageID: string,
        message: any,
        sender: browser.runtime.MessageSender,
    ): Promise<void>
}

const key = 'holoflowsjsonrpc'
class MessageCenter {
    constructor() {
        document.addEventListener(key, e => {
            const detail = (e as CustomEvent<any>).detail
            if (location.href === 'about:blank') {
                console.log('receive', detail)
            }
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
    send(_: string, data: any): void {
        if (location.href === 'about:blank') {
            console.log('send', data)
            Object.assign(window, {
                response: (response: any) => {
                    document.dispatchEvent(
                        new CustomEvent<any>(key, {
                            detail: {
                                jsonrpc: '2.0',
                                id: data.id,
                                result: response,
                            },
                        }),
                    )
                },
            })
        }
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers[key])
            window.webkit.messageHandlers[key].postMessage(data)
    }
}
export const Host = AsyncCall<Host>(
    {},
    {
        dontThrowOnNotImplemented: false,
        key: '',
        strictJSONRPC: true,
        writeToConsole: true,
        MessageCenter,
    },
)