import { readFileSync, writeFileSync } from 'fs'
import { resolve, basename } from 'path'
import { transformAST, PrebuiltVersion } from '../transformers'

export function exec(sourceMapPathSemi: string, fileName: string) {
    const fileContent = readFileSync(fileName, 'utf-8')

    const absolutePath = resolve(process.cwd(), fileName)
    const fileBaseName = basename(absolutePath)
    const prefix = fileBaseName + '.prebuilt-' + PrebuiltVersion
    const moduleOut = resolve(absolutePath, '../', prefix + '-module')
    const scriptOut = resolve(absolutePath, '../', prefix + '-script')

    const sourceMapPath = 'holoflows-extension://' + sourceMapPathSemi

    writeFileSync(moduleOut, transformAST(fileContent, 'module', sourceMapPath))
    writeFileSync(scriptOut, transformAST(fileContent, 'script', sourceMapPath))
}

if (process.mainModule === module) {
    const [sourceMapPathSemi, fileName] = process.argv.slice(2)
    if (!fileName)
        throw new Error(
            'Usage: prebuilt sourceMapPath fileName\ne.g.: prebuilt eofkdgkhfoebecmamljfaepckoecjhib/js/index.js js/index.js',
        )
    exec(sourceMapPathSemi, fileName)
}
