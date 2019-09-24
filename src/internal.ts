import { Host } from './RPC'
/**
 * This ID is used by this polyfill itself.
 */
export const reservedID = '150ea6ee-2b0a-4587-9879-0ca5dfc1d046'
export async function modifyInternalStorage(extensionID: string, modify: (obj: InternalStorage) => void) {
    if (location.hostname === 'localhost') {
        const obj = JSON.parse(localStorage.getItem(reservedID + ':' + extensionID) || '{}')
        modify(obj)
        localStorage.setItem(reservedID + ':' + extensionID, JSON.stringify(obj))
        return Promise.resolve()
    }
    return Host['browser.storage.local.get'](reservedID, extensionID)
        .then((obj: any) => {
            modify(obj[extensionID] || {})
            return obj
        })
        .then(o => Host['browser.storage.local.set'](reservedID, { [extensionID]: o }))
}
export async function modifyGlobalInternalStorage(extensionID: string, modify: (obj: GlobalStorage) => void) {
    if (location.hostname === 'localhost') {
        const obj = JSON.parse(localStorage.getItem(reservedID + ':' + reservedID) || '{}')
        modify(obj)
        localStorage.setItem(reservedID + ':' + reservedID, JSON.stringify(obj))
        return Promise.resolve()
    }
    return Host['browser.storage.local.get'](reservedID, reservedID)
        .then((obj: any) => {
            modify(obj[extensionID] || {})
            return obj
        })
        .then(o => Host['browser.storage.local.set'](reservedID, { [reservedID]: o }))
}

interface InternalStorage {
    previousVersion?: string
}
interface GlobalStorage {}
