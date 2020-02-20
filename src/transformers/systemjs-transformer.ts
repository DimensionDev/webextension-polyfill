import ts, { Statement, NodeArray, SourceFile } from 'typescript'
export function systemjsNameEscapeTransformer(context: ts.TransformationContext) {
    function visit(node: ts.Node): ts.VisitResult<ts.Node> {
        if (ts.isSourceFile(node)) {
            return ts.updateSourceFileNode(node, [createSystemF(node.statements)])
        }
        return node
    }
    return (node => {
        try {
            return visit(node)
        } catch {
            return node
        }
    }) as (node: SourceFile) => SourceFile
}
/**
 * Return `System => { [statements] }`
 */
function createSystemF(statements: NodeArray<Statement>) {
    return ts.createExpressionStatement(
        ts.createArrowFunction(
            void 0,
            void 0,
            [ts.createParameter(void 0, void 0, void 0, ts.createIdentifier('System'), void 0, void 0, void 0)],
            void 0,
            ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
            ts.createBlock(statements, true),
        ),
    )
}
