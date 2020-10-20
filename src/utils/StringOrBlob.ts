import { FrameworkStringOrBinary } from '../RPCs/framework-rpc'
import { Buffer } from 'buffer'
export function decodeStringOrBlob(val: FrameworkStringOrBinary): Blob | string | ArrayBuffer | null {
    if (val.type === 'text') return val.content
    if (val.type === 'blob') return new Blob([val.content], { type: val.mimeType })
    if (val.type === 'array buffer') {
        return base64DecToArr(val.content).buffer
    }
    return null
}
export async function encodeStringOrBufferSource(val: Blob | string | BufferSource): Promise<FrameworkStringOrBinary> {
    if (typeof val === 'string') return { type: 'text', content: val }
    if (val instanceof Blob) {
        const buffer = new Uint8Array(await new Response(val).arrayBuffer())
        return { type: 'blob', mimeType: val.type, content: base64EncArr(buffer) }
    }
    if (val instanceof ArrayBuffer) {
        return { type: 'array buffer', content: base64EncArr(new Uint8Array(val)) }
    }
    if ('buffer' in val && val.buffer instanceof ArrayBuffer) {
        return encodeStringOrBufferSource(val.buffer)
    }
    console.error(val)
    throw new TypeError('Invalid type')
}

function base64DecToArr(sBase64: string, nBlockSize?: number): Uint8Array {
    return new Uint8Array(Buffer.from(sBase64, 'base64'))
}

function base64EncArr(aBytes: Uint8Array): string {
    return Buffer.from(aBytes).toString('base64')
}
