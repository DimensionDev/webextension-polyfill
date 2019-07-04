import { Host } from '../RPC'

import { TwoWayMessagePromiseResolver, EventPools } from '../utils/LocalMessages'
import { deepClone } from '../utils/deepClone'
/**
 * Create browser.runtime.sendMessage() function
 * @param extensionID
 */
export function createSendMessage(extensionID: string) {
    return function() {
        let toExtensionID: string, message: unknown, options: unknown
        if (arguments.length === 1) {
            toExtensionID = extensionID
            message = arguments[0]
        } else if (arguments.length === 2) {
            toExtensionID = arguments[0]
            message = arguments[1]
        } else {
            toExtensionID = ''
        }
        return new Promise((resolve, reject) => {
            const messageID = Math.random().toString()
            Host.sendMessage(extensionID, toExtensionID, null, messageID, {
                data: message,
                response: false,
            }).catch(e => {
                reject(e)
                TwoWayMessagePromiseResolver.delete(messageID)
            })
            TwoWayMessagePromiseResolver.set(messageID, [resolve, reject])
        })
    }
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
            const result = fn(deepClone(message), deepClone(sender), sendResponseDeprecated)
            if (result === undefined) {
                // ? do nothing
            } else if (typeof result === 'boolean') {
                // ! deprecated path !
            } else if (typeof result === 'object' && typeof result.then === 'function') {
                // ? response the answer
                result.then((data: unknown) => {
                    if (data === undefined || responseSend) return
                    responseSend = true
                    Host.sendMessage(toExtensionID, extensionID, sender.tab!.id!, messageID, { data, response: true })
                })
            }
        } catch (e) {
            console.error(e)
        }
    }
}
export interface InternalMessage {
    data: any
    error?: { message: string; stack: string }
    response: boolean
}

function sendResponseDeprecated(): any {
    throw new Error(
        'Returning a Promise is the preferred way' +
            ' to send a reply from an onMessage/onMessageExternal listener, ' +
            'as the sendResponse will be removed from the specs ' +
            '(See https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage)',
    )
}
