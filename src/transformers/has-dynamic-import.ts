import ts, { TransformationContext, SourceFile } from 'typescript'
export function checkDynamicImport(source: string) {
    let hasDyn = false
    const sf = ts.createSourceFile('x.js', source, ts.ScriptTarget.ESNext, false, ts.ScriptKind.JS)
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
        },
    })
    return hasDyn
}

function isDynamicImport(node: ts.Node): boolean {
    if (!ts.isCallExpression(node)) return false
    if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        return true
    }
    return false
}
