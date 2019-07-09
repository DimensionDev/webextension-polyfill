import { Host, StringOrBlob } from '../RPC'
import { encodeStringOrBlob, decodeStringOrBlob } from '../utils/StringOrBlob'

const { CLOSED, CLOSING, CONNECTING, OPEN } = WebSocket
const WebSocketID: Map<WebSocket, number> = new Map()
function getID(instance: WebSocket) {
    return WebSocketID.get(instance)!
}
function getInstance(id: number) {
    return Array.from(WebSocketID).find(([x, y]) => y === id)![0]
}
const WebSocketReadyState: Map<WebSocket, number> = new Map()
export function createWebSocket(extensionID: string): typeof WebSocket {
    /**
     * See: https://html.spec.whatwg.org/multipage/web-sockets.html
     */
    class WS extends EventTarget implements WebSocket {
        //#region Constants
        static readonly CLOSED = CLOSED
        static readonly CONNECTING = CONNECTING
        static readonly OPEN = OPEN
        static readonly CLOSING = CLOSING
        CLOSED = CLOSED
        CONNECTING = CONNECTING
        OPEN = OPEN
        CLOSING = CLOSING
        //#endregion
        constructor(public readonly url: string, protocols: string | string[] = []) {
            super()
            Host['websocket.create'](extensionID, url).then(onOpen.bind(this), onWebSocketError.bind(null, 0, ''))
        }
        get binaryType(): BinaryType {
            return 'blob'
        }
        set binaryType(val) {
            // Todo
        }
        readonly bufferedAmount = 0
        extensions = ''
        onclose: any
        onerror: any
        onopen: any
        onmessage: any
        get readyState(): number {
            return WebSocketReadyState.get(this)!
        }
        protocol: any
        close(code = 1005, reason = '') {
            Host['websocket.close'](extensionID, WebSocketID.get(this)!, code, reason).then(
                onWebSocketClose.bind(this, getID(this), code, reason, true),
            )
            WebSocketReadyState.set(this, CLOSING)
        }
        send(message: string | Blob | ArrayBuffer) {
            encodeStringOrBlob(message).then(data => {
                Host['websocket.send'](extensionID, WebSocketID.get(this)!, data)
            })
        }
    }
    const constants: PropertyDescriptorMap = {
        CLOSED: { configurable: false, writable: false, enumerable: true, value: CLOSED },
        CLOSING: { configurable: false, writable: false, enumerable: true, value: CLOSING },
        CONNECTING: { configurable: false, writable: false, enumerable: true, value: CONNECTING },
        OPEN: { configurable: false, writable: false, enumerable: true, value: OPEN },
    }
    Object.defineProperties(WS, constants)
    Object.defineProperties(WS.prototype, constants)
    return WS
}
export function onWebSocketClose(websocketID: number, code: number, reason: string, wasClean: boolean): void {
    const ws = getInstance(websocketID)
    const e = new CloseEvent('close', { reason, wasClean, code })
    WebSocketReadyState.set(ws, CLOSED)
    WebSocketID.delete(ws)
    if (typeof ws.onclose === 'function') ws.onclose(e)
    ws.dispatchEvent(e)
}
function onOpen(this: WebSocket, websocketID: number) {
    const e = new Event('open')
    WebSocketReadyState.set(this, OPEN)
    WebSocketID.set(this, websocketID)
    if (typeof this.onopen === 'function') this.onopen(e)
    this.dispatchEvent(e)
}
export function onWebSocketError(websocketID: number, reason: string) {
    const ws = getInstance(websocketID)
    const e = new Event('error')
    WebSocketReadyState.set(ws, CLOSED)
    if (typeof ws.onerror === 'function') ws.onerror(e)
    ws.dispatchEvent(e)
}
export function onWebSocketMessage(webSocketID: number, message: StringOrBlob) {
    const ws = getInstance(webSocketID)
    const e = new MessageEvent('message', { data: decodeStringOrBlob(message) })
    if (typeof ws.onmessage === 'function') ws.onmessage(e)
    ws.dispatchEvent(e)
}
