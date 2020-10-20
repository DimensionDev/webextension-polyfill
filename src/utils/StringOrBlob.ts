import { FrameworkStringOrBinary } from '../RPCs/framework-rpc'
import { Buffer } from 'buffer'
export function decodeStringOrBufferSource(val: FrameworkStringOrBinary): Blob | string | ArrayBuffer | null {
    if (val.type === 'text') return val.content
    if (val.type === 'blob') return new Blob([Uint8ArrayFromBase64(val.content)], { type: val.mimeType })
    if (val.type === 'array buffer') {
        return Uint8ArrayFromBase64(val.content).buffer
    }
    return null
}
export async function encodeStringOrBufferSource(val: Blob | string | BufferSource): Promise<FrameworkStringOrBinary> {
    if (typeof val === 'string') return { type: 'text', content: val }
    if (val instanceof Blob) {
        const buffer = new Uint8Array(await new Response(val).arrayBuffer())
        return { type: 'blob', mimeType: val.type, content: Uint8ArrayToBase64(buffer) }
    }
    if (val instanceof ArrayBuffer) {
        return { type: 'array buffer', content: Uint8ArrayToBase64(new Uint8Array(val)) }
    }
    if ('buffer' in val && val.buffer instanceof ArrayBuffer) {
        return encodeStringOrBufferSource(val.buffer)
    }
    console.error(val)
    throw new TypeError('Invalid type')
}

function Uint8ArrayFromBase64(sBase64: string, nBlockSize?: number): Uint8Array {
    return new Uint8Array(Buffer.from(sBase64, 'base64'))
}

function Uint8ArrayToBase64(aBytes: Uint8Array): string {
    return Buffer.from(aBytes).toString('base64')
}
