import type { TransformationContext, SourceFile } from 'typescript'
import * as ts from 'typescript'
const cache = new Map<string, boolean>()
export function checkDynamicImport(source: string): boolean {
    if (cache.has(source)) return cache.get(source)!
    let hasDyn = false
    function i(k: TransformationContext) {
        function visit(n: ts.Node): ts.VisitResult<ts.Node> {
            if (hasDyn) return n
            if (isDynamicImport(n)) hasDyn = true
            return ts.visitEachChild(n, visit, k)
        }
        return (x: SourceFile) => visit(x) as SourceFile
    }
    ts.transpileModule(source, {
        transformers: {
            before: [i],
        },
        reportDiagnostics: true,
        compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
        },
    })
    cache.set(source, hasDyn)
    return hasDyn
}

function isDynamicImport(node: ts.Node): boolean {
    if (!ts.isCallExpression(node)) return false
    if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        return true
    }
    return false
}
