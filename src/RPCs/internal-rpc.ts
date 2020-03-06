/**
 * Internal RPC calls of webextension-shim. Does not related to the native part.
 *
 * This channel is used as internal RPCs.
 * Use Host.onMessage and Host.sendMessage as channel.
 */
import { isDebug } from '../debugger/isDebugMode'
import { reservedID } from '../internal'
import { AsyncCall } from 'async-call-rpc'
import { Manifest, registeredWebExtension, loadContentScript, registerWebExtension } from '../Extensions'
import { FrameworkRPC } from './framework-rpc'

/**
 * Every method of InternalRPCMethods must start with parameter 0 as `targetTabID: number`
 */
interface InternalRPCMethods {
    /**
     * Should inject the given script into the given tabID
     * @param tabID - inject to which tab
     * @param extensionID - the extension id
     * @param manifest - the manifest
     * @param details - See https://mdn.io/browser.tabs.executeScript
     */
    executeContentScript(
        tabID: number,
        extensionID: string,
        manifest: Manifest,
        opts: {
            code?: string
            file?: string
            runAt?: 'document_start' | 'document_end' | 'document_idle'
        },
    ): Promise<unknown>
}
export const internalRPCChannel = new (class WebExtensionInternalChannel {
    public listener: Array<(data: unknown) => void> = []
    on(_: string, cb: (data: any) => void): void {
        this.listener.push(cb)
    }
    onReceiveMessage(key: string, data: JSONRPCRequest): void {
        for (const f of this.listener) {
            try {
                f(data)
            } catch {}
        }
    }
    emit(key: string, data: JSONRPCRequest): void {
        if (isDebug) {
            console.log('send', data)
        }
        if (!(typeof data === 'object')) return
        if (data.method) {
            if (!Array.isArray(data.params)) return
            if (typeof data.params[0] !== 'number')
                throw new Error(`Every method of InternalRPCMethods must start with parameter 0 as targetTabID: number`)
            FrameworkRPC.sendMessage(reservedID, reservedID, data.params[0], Math.random() + '', {
                type: 'internal-rpc',
                message: data,
            })
            return
        } else {
            FrameworkRPC.sendMessage(reservedID, reservedID, null, Math.random() + '', {
                type: 'internal-rpc',
                message: data,
            })
        }
    }
})()
const internalRPCLocalImplementation: InternalRPCMethods = {
    async executeContentScript(targetTabID, extensionID, manifest, options) {
        console.debug('[WebExtension] requested to inject code', options)
        const ext =
            registeredWebExtension.get(extensionID) ||
            (await registerWebExtension(extensionID, manifest, {})).get(extensionID)!
        if (options.code) ext.environment.evaluateInlineScript(options.code)
        else if (options.file)
            loadContentScript(extensionID, {
                js: [options.file],
                // TODO: check the permission to inject the script
                matches: ['<all_urls>'],
            })
    },
}
export const internalRPC = AsyncCall<InternalRPCMethods>(internalRPCLocalImplementation, {
    log: false,
    messageChannel: internalRPCChannel,
})
interface JSONRPCRequest {
    jsonrpc: '2.0'
    id: number | string | null
    method: string
    params: unknown[] | object
}
