import { FrameworkRPC } from '../RPCs/framework-rpc'
import { encodeStringOrBlob } from '../utils/StringOrBlob'

const { createObjectURL, revokeObjectURL } = URL
export function getIDFromBlobURL(x: string) {
    if (x.startsWith('blob:')) return new URL(new URL(x).pathname).pathname.replace(/^\//, '')
    return undefined
}
/**
 * Modify the behavior of URL.*
 * Let the blob:// url can be recognized by Host.
 *
 * @param url The original URL object
 * @param extensionID
 */
export function enhanceURL(url: typeof URL, extensionID: string) {
    url.createObjectURL = createObjectURLEnhanced(extensionID)
    url.revokeObjectURL = revokeObjectURLEnhanced(extensionID)
    return url
}

function revokeObjectURLEnhanced(extensionID: string): (url: string) => void {
    return (url: string) => {
        revokeObjectURL(url)
        const id = getIDFromBlobURL(url)!
        FrameworkRPC['URL.revokeObjectURL'](extensionID, id)
    }
}

function createObjectURLEnhanced(extensionID: string): (object: any) => string {
    return (obj: File | Blob | MediaSource) => {
        const url = createObjectURL(obj)
        const resourceID = getIDFromBlobURL(url)!
        if (obj instanceof Blob) {
            encodeStringOrBlob(obj).then(blob => FrameworkRPC['URL.createObjectURL'](extensionID, resourceID, blob))
        }
        return url
    }
}

function blobToBase64(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.addEventListener('loadend', () => {
            const [header, base64] = (reader.result as string).split(',')
            resolve(base64)
        })
        reader.addEventListener('error', e => reject(e))
        reader.readAsDataURL(blob)
    })
}
