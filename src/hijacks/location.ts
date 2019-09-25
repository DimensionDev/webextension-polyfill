import { parseDebugModeURL } from '../debugger/isDebugMode'
import { Manifest } from '../Extensions'

export function createLocationProxy(extensionID: string, manifest: Manifest, currentPage: string): Location {
    const locationProxy = new Proxy({} as any, {
        get(target: Location, key: keyof Location) {
            target = location
            const obj = target[key] as any
            if (key === 'reload') return () => target.reload()
            if (key === 'assign' || key === 'replace')
                return (url: string) => {
                    const { src: base } = parseDebugModeURL(extensionID, manifest)
                    locationProxy.href = new URL(url, base)
                }
            const mockedURL = new URL(currentPage)
            if (key in mockedURL) return mockedURL[key as keyof URL]
            console.warn('Accessing', key, 'on location')
            return obj
        },
        set(target: Location, key: keyof Location, value: any) {
            target = location
            if (key === 'origin') return false
            const mockedURL = new URL(currentPage)
            if (key in mockedURL) {
                if (!Reflect.set(mockedURL, key, value)) return false
                const search = new URLSearchParams(target.search)
                search.set('url', mockedURL.toJSON())
                target.search = search.toString()
                return true
            }
            console.warn('Setting', key, 'on location to', value)
            return Reflect.set(target, key, value)
        },
        getOwnPropertyDescriptor: safeGetOwnPropertyDescriptor,
    })
    return locationProxy
}

const safeGetOwnPropertyDescriptor = (obj: any, key: any) => {
    const orig = Reflect.getOwnPropertyDescriptor(obj, key)
    if (!orig) return undefined
    return { ...orig, configurable: true }
}
