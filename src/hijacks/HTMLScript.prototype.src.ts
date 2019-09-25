import { getResource, getResourceAsync } from '../utils/Resources'
import { RunInProtocolScope, Manifest } from '../Extensions'

export function writeHTMLScriptElementSrc(
    extensionID: string,
    manifest: Manifest,
    preloadedResources: Record<string, any>,
    currentPage: string,
) {
    const src = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src')!
    Object.defineProperty(HTMLScriptElement.prototype, 'src', {
        get() {
            return src.get!.call(this)
        },
        set(this: HTMLScriptElement, path) {
            console.debug('script src=', path)
            const preloaded = getResource(extensionID, preloadedResources, path)
            if (preloaded) RunInProtocolScope(extensionID, manifest, preloaded, currentPage)
            else
                getResourceAsync(extensionID, preloadedResources, path)
                    .then(code => code || Promise.reject<string>('Loading resource failed'))
                    .then(code => RunInProtocolScope(extensionID, manifest, code, currentPage))
                    .catch(e => console.error(`Failed when loading resource`, path, e))
            this.dataset.src = path
            return true
        },
    })
}
