import { FrameworkStringOrBlob } from '../RPCs/framework-rpc'

export function decodeStringOrBlob(val: FrameworkStringOrBlob): Blob | string | ArrayBuffer | null {
    if (val.type === 'text') return val.content
    if (val.type === 'blob') return new Blob([val.content], { type: val.mimeType })
    if (val.type === 'array buffer') {
        return base64DecToArr(val.content).buffer
    }
    return null
}
export async function encodeStringOrBlob(val: Blob | string | ArrayBuffer): Promise<FrameworkStringOrBlob> {
    if (typeof val === 'string') return { type: 'text', content: val }
    if (val instanceof Blob) {
        const buffer = new Uint8Array(await new Response(val).arrayBuffer())
        return { type: 'blob', mimeType: val.type, content: base64EncArr(buffer) }
    }
    if (val instanceof ArrayBuffer) {
        return { type: 'array buffer', content: base64EncArr(new Uint8Array(val)) }
    }
    throw new TypeError('Invalid data')
}

//#region // ? Code from https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding#Appendix.3A_Decode_a_Base64_string_to_Uint8Array_or_ArrayBuffer
function b64ToUint6(nChr: number) {
    return nChr > 64 && nChr < 91
        ? nChr - 65
        : nChr > 96 && nChr < 123
        ? nChr - 71
        : nChr > 47 && nChr < 58
        ? nChr + 4
        : nChr === 43
        ? 62
        : nChr === 47
        ? 63
        : 0
}

function base64DecToArr(sBase64: string, nBlockSize?: number) {
    var sB64Enc = sBase64.replace(/[^A-Za-z0-9\+\/]/g, ''),
        nInLen = sB64Enc.length,
        nOutLen = nBlockSize ? Math.ceil(((nInLen * 3 + 1) >>> 2) / nBlockSize) * nBlockSize : (nInLen * 3 + 1) >>> 2,
        aBytes = new Uint8Array(nOutLen)

    for (var nMod3, nMod4, nUint24 = 0, nOutIdx = 0, nInIdx = 0; nInIdx < nInLen; nInIdx++) {
        nMod4 = nInIdx & 3
        nUint24 |= b64ToUint6(sB64Enc.charCodeAt(nInIdx)) << (18 - 6 * nMod4)
        if (nMod4 === 3 || nInLen - nInIdx === 1) {
            for (nMod3 = 0; nMod3 < 3 && nOutIdx < nOutLen; nMod3++, nOutIdx++) {
                aBytes[nOutIdx] = (nUint24 >>> ((16 >>> nMod3) & 24)) & 255
            }
            nUint24 = 0
        }
    }

    return aBytes
}
function uint6ToB64(nUint6: number) {
    return nUint6 < 26
        ? nUint6 + 65
        : nUint6 < 52
        ? nUint6 + 71
        : nUint6 < 62
        ? nUint6 - 4
        : nUint6 === 62
        ? 43
        : nUint6 === 63
        ? 47
        : 65
}

function base64EncArr(aBytes: Uint8Array) {
    var eqLen = (3 - (aBytes.length % 3)) % 3,
        sB64Enc = ''

    for (var nMod3, nLen = aBytes.length, nUint24 = 0, nIdx = 0; nIdx < nLen; nIdx++) {
        nMod3 = nIdx % 3
        /* Uncomment the following line in order to split the output in lines 76-character long: */
        /*
      if (nIdx > 0 && (nIdx * 4 / 3) % 76 === 0) { sB64Enc += "\r\n"; }
      */
        nUint24 |= aBytes[nIdx] << ((16 >>> nMod3) & 24)
        if (nMod3 === 2 || aBytes.length - nIdx === 1) {
            sB64Enc += String.fromCharCode(
                uint6ToB64((nUint24 >>> 18) & 63),
                uint6ToB64((nUint24 >>> 12) & 63),
                uint6ToB64((nUint24 >>> 6) & 63),
                uint6ToB64(nUint24 & 63),
            )
            nUint24 = 0
        }
    }

    return eqLen === 0 ? sB64Enc : sB64Enc.substring(0, sB64Enc.length - eqLen) + (eqLen === 1 ? '=' : '==')
}
