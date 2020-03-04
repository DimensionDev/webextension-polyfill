import ts from 'typescript'
import { thisTransformation } from './this-transformer'
import { systemjsNameNoLeakTransformer } from './systemjs-transformer'
import { checkDynamicImport } from './has-dynamic-import'

const scriptCache = new Map<string, string>()
const moduleCache = new Map<string, string>()
/**
 * For scripts, we treat it as a module with no static import/export.
 */
export function transformAST(src: string, kind: 'script' | 'module', path: string): string {
    const cache = kind === 'module' ? moduleCache : scriptCache
    if (cache.has(src)) return cache.get(src)!
    const hasDynamicImport = checkDynamicImport(src)
    const scriptBefore = undefined
    const scriptAfter = [thisTransformation, hasDynamicImport ? systemjsNameNoLeakTransformer : undefined!].filter(
        x => x,
    )
    const moduleBefore = undefined
    const moduleAfter = [systemjsNameNoLeakTransformer]
    function getSourcePath(): { sourceRoot?: string; fileName: string } {
        const _ = path.split('/')
        const filename = _.pop()!
        const sourceRoot = _.join('/')
        return { fileName: filename, sourceRoot }
    }
    const { fileName, sourceRoot } = getSourcePath()
    const out = ts.transpileModule(src, {
        transformers: {
            before: kind === 'script' ? scriptBefore : moduleBefore,
            after: kind === 'script' ? scriptAfter : moduleAfter,
        },
        reportDiagnostics: true,
        compilerOptions: {
            // ? we're assuming the developer has ran the transformer so we are not going to run any downgrade for them
            target: ts.ScriptTarget.ESNext,
            // ? Also use System in script type therefore the dynamic import will work
            // ? If no need for module, keep it ESNext (and throw by browser)
            module: hasDynamicImport || kind === 'module' ? ts.ModuleKind.System : ts.ModuleKind.ESNext,
            // ? A comment in React dev will make a false positive on realms checker
            removeComments: true,
            inlineSourceMap: true,
            inlineSources: true,
            sourceRoot,
        },
        fileName,
    })
    const error = []
    for (const err of out.diagnostics || []) {
        let errText = typeof err.messageText === 'string' ? err.messageText : err.messageText.messageText
        if (err.file && err.start !== undefined && err.length !== undefined) {
            const source = err.file.getFullText()
            const startLineNum = (source.slice(0, err.start).match(/\n/g) || []).length
            const endLineNum = (source.slice(0, err.start + err.length).match(/\n/g) || []).length
            const lines = source.split('\n')
            const lineIndicatorLength = endLineNum.toString().length + 5
            const getLineWithNo = (n: number) =>
                lines[n] ? `Line ${n + 1} |`.padStart(lineIndicatorLength) + '  ' + lines[n] : null
            const aroundLines = [
                getLineWithNo(startLineNum - 3),
                getLineWithNo(startLineNum - 2),
                getLineWithNo(startLineNum - 1),
                getLineWithNo(startLineNum),
                ''.padStart(lineIndicatorLength + 4) + '~'.repeat(lines[startLineNum].length),
                startLineNum !== endLineNum ? '......' + getLineWithNo(endLineNum) : null,
                getLineWithNo(endLineNum + 1),
                getLineWithNo(endLineNum + 2),
                getLineWithNo(endLineNum + 3),
            ].filter(x => x) as string[]
            errText += `\n${aroundLines.join('\n')}\n`
        }
        error.push(new SyntaxError(errText))
    }
    if (error[0]) throw error[0]
    cache.set(src, out.outputText)
    return out.outputText
}
