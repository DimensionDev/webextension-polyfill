import { transformAST } from '../transformers'
import { checkDynamicImport } from '../transformers/has-dynamic-import'
export function prebuiltWorker(content: string, mode: 'script' | 'module', path = '') {
    if (mode === 'module') {
        return transformAST(content, mode, path)
    } else {
        const hasDynImport = checkDynamicImport(content)
        const prefix = hasDynImport ? '//d\n' : '//s\n'
        return prefix + transformAST(content, mode, path)
    }
}
