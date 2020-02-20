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
            const kind = this.type === 'module' ? 'module' : 'script'
            if (preloaded) RunInProtocolScope(extensionID, manifest, { source: preloaded, path }, currentPage, kind)
            else
                getResourceAsync(extensionID, preloadedResources, path)
                    .then(code => code || Promise.reject<string>('Loading resource failed'))
                    .then(source => RunInProtocolScope(extensionID, manifest, { source, path }, currentPage, kind))
                    .catch(e => console.error(`Failed when loading resource`, path, e))
            this.dataset.src = path
            return true
        },
    })
}
