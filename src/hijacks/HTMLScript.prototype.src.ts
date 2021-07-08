import { RunInProtocolScope, Manifest } from '../Extensions'

export const originalScriptSrcDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src')!
export function hookedHTMLScriptElementSrc(extensionID: string, manifest: Manifest, currentPage: string) {
    const src = originalScriptSrcDesc
    Object.defineProperty(HTMLScriptElement.prototype, 'src', {
        get() {
            return src.get!.call(this)
        },
        set(this: HTMLScriptElement, path) {
            console.debug('script src=', path)
            const kind = this.type === 'module' ? 'module' : 'script'
            RunInProtocolScope(extensionID, manifest, { type: 'file', path }, currentPage, kind)
            this.dataset.src = path
            return true
        },
    })
}
