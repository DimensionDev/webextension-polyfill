import { FrameworkRPC } from '../RPCs/framework-rpc'

import { TwoWayMessagePromiseResolver, EventPools } from '../utils/LocalMessages'
import { deepClone } from '../utils/deepClone'
/**
 * Create browser.runtime.sendMessage() function
 * @param extensionID
 */
export function createRuntimeSendMessage(extensionID: string) {
    return function () {
        let toExtensionID: string, message: unknown
        if (arguments.length === 1) {
            toExtensionID = extensionID
            message = arguments[0]
        } else if (arguments.length === 2) {
            toExtensionID = arguments[0]
            message = arguments[1]
        } else {
            toExtensionID = ''
        }
        return sendMessageWithResponse(extensionID, toExtensionID, null, message)
    }
}
export function sendMessageWithResponse<U>(
    extensionID: string,
    toExtensionID: string,
    tabId: number | null,
    message: unknown,
) {
    return new Promise<U>((resolve, reject) => {
        const messageID = Math.random().toString()
        FrameworkRPC.sendMessage(extensionID, toExtensionID, tabId, messageID, {
            type: 'message',
            data: message,
            response: false,
        }).catch((e) => {
            reject(e)
            TwoWayMessagePromiseResolver.delete(messageID)
        })
        TwoWayMessagePromiseResolver.set(messageID, [resolve, reject])
    })
}

/**
 * Message handler of normal message
 */
export function onNormalMessage(
    message: any,
    sender: browser.runtime.MessageSender,
    toExtensionID: string,
    extensionID: string,
    messageID: string,
) {
    const fns: Set<browser.runtime.onMessageEvent> | undefined = EventPools['browser.runtime.onMessage'].get(
        toExtensionID,
    )
    if (!fns) return
    let responseSend = false
    for (const fn of fns) {
        try {
            // ? dispatch message
            const result = fn(deepClone(message), deepClone(sender), sendResponse as any)
            if (result === undefined) {
                // ? do nothing
            } else if (typeof result === 'boolean') {
                // ! do what ? this is the deprecated path
            } else if (typeof result === 'object' && typeof result.then === 'function') {
                // ? response the answer
                result.then((data: unknown) => {
                    if (data === undefined) return
                    sendResponse(data)
                })
            }
        } catch (e) {
            console.error(e)
        }
    }
    function sendResponse(data: unknown) {
        if (responseSend) return false
        responseSend = true
        FrameworkRPC.sendMessage(toExtensionID, extensionID, sender.tab!.id!, messageID, {
            data,
            response: true,
            type: 'message',
        })
        return true
    }
}
export type InternalMessage =
    | {
          data: any
          error?: { message: string; stack: string }
          response: boolean
          type: 'message'
      }
    | {
          type: 'onWebNavigationChanged'
          // Other events seems impossible to implement
          status: 'onCommitted' | 'onDOMContentLoaded' | 'onCompleted' | 'onHistoryStateUpdated'
          location: string
      }
    | { type: 'internal-rpc'; message: any }
    | { type: 'onPortCreate'; portID: string; name: string }
    | { type: 'onPortMessage'; portID: string; message: any }
    | { type: 'onPortDisconnect'; portID: string }
