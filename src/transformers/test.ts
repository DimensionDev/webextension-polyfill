// @ts-nocheck
import ts from 'typescript'
import { staticCapture } from './variable-capture'
console.log(
    ts.transpileModule(test.toString(), {
        fileName: 'index.ts',
        compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            downlevelIteration: true,
        },
        transformers: { after: [staticCapture()] },
    }).outputText,
)
async function test() {
    const { x = ([y] = z) } = i
}
