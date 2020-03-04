import ts, { SourceFile } from 'typescript'
export function throwForNonESM(context: ts.TransformationContext) {
    function visit(node: SourceFile): SourceFile {
        if (ts.isSourceFile(node)) {
            const d = node.statements.find(
                x => ts.isExportAssignment(x) || ts.isImportDeclaration(x) || ts.isExportDeclaration(x),
            )
            if (d) {
                return ts.updateSourceFileNode(node, [createThrow(ts.isImportDeclaration(d) ? 'import' : 'export')])
            }
        }
        return node
    }
    return visit
}
function createThrow(kind: 'import' | 'export') {
    const a = 'Cannot use import statement outside a module'
    const b = `Unexpected token 'export'`
    return ts.createThrow(
        ts.createNew(ts.createIdentifier('SyntaxError'), [], [ts.createLiteral(kind === 'import' ? a : b)]),
    )
}
