import ts, { SourceFile } from 'typescript'
/**
 * Transform any code to "return" it's last expression value
 * @param context
 */
export function lastExprValue(context: ts.TransformationContext) {
    function visit(node: ts.Node): ts.Node {
        if (ts.isSourceFile(node)) {
            const [last, ...rest] = [...node.statements].reverse()
            if (ts.isExpressionStatement(last)) {
                return ts.updateSourceFileNode(node, [ts.createReturn(last.expression), ...rest].reverse())
            }
            return node
        }
        return ts.visitEachChild(node, visit, context)
    }
    return visit as any
}
