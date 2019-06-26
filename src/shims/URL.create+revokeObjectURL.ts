import { Host } from '../RPC'

const { createObjectURL, revokeObjectURL } = URL
function getIDFromBlobURL(x: string) {
    return new URL(new URL(x).pathname).pathname
}
export function enhanceURL(url: typeof URL, extensionID: string) {
    url.createObjectURL = createObjectURLEnhanced(extensionID)
    url.revokeObjectURL = revokeObjectURLEnhanced(extensionID)
    return url
}

function revokeObjectURLEnhanced(extensionID: string): (url: string) => void {
    return (url: string) => {
        revokeObjectURL(url)
        const id = getIDFromBlobURL(url)
        Host['URL.revokeObjectURL'](extensionID, id)
    }
}

function createObjectURLEnhanced(extensionID: string): (object: any) => string {
    return (obj: File | Blob | MediaSource) => {
        const url = createObjectURL(obj)
        const resourceID = getIDFromBlobURL(url)
        if (obj instanceof Blob) {
            blobToBase64(obj).then(base64 => Host['URL.createObjectURL'](extensionID, resourceID, base64, obj.type))
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
