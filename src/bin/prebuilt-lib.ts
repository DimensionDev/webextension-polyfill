import { transformAST, PrebuiltVersion } from '../transformers'
import { checkDynamicImport } from '../transformers/has-dynamic-import'
import { Transform, Readable } from 'stream'
export function prebuiltWorker(content: string, mode: 'script' | 'module', path = '') {
    if (mode === 'module') {
        return transformAST(content, mode, path)
    } else {
        const hasDynImport = checkDynamicImport(content)
        const prefix = hasDynImport ? 'd' : 's'
        return prefix + transformAST(content, mode, path)
    }
}
import type { BufferFile } from 'vinyl'
export function gulpPrebuilt(mode: 'script' | 'module') {
    const rename = require('gulp-rename') as typeof import('gulp-rename')
    const rewriteStream = rename((path) => {
        path.extname = path.extname + `.prebuilt-${PrebuiltVersion}-${mode}`
    })
    const stream = new Transform({
        objectMode: true,
        transform(file: BufferFile, _enc, callback) {
            if (!file.isBuffer()) return callback(null, file)
            const code = String(file.contents)
            // un-typed API?
            file.contents = (Readable as any).from(prebuiltWorker(code, mode))
            return callback(null, file)
        },
    })
    return [stream, rewriteStream] as const
}
