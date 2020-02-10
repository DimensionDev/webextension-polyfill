import ts from 'typescript'
import { thisTransformation } from './this-transformer'

export function transformAST(src: string) {
    const out = ts.transpileModule(src, {
        transformers: {
            after: [thisTransformation],
        },
        reportDiagnostics: true,
        compilerOptions: {
            // ? we're assuming the developer has ran the transformer so we are not going to run any downgrade for them
            target: ts.ScriptTarget.ESNext,
            removeComments: true,
        },
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
    return out.outputText
}
