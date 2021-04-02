import * as ts from 'typescript'
import type { Statement, NodeArray, SourceFile, CallExpression } from 'typescript'
export function systemjsNameNoLeakTransformer(context: ts.TransformationContext) {
    let touched = false
    let systemJSCall: CallExpression
    function visit(node: ts.Node): ts.Node {
        if (touched) return node
        if (ts.isSourceFile(node)) {
            systemJSCall = node.statements.map(getSystemJSRegisterCallArguments).filter((x) => x)[0]! as CallExpression
            if (!systemJSCall) throw new TypeError('Invalid transform')
            return ts.updateSourceFileNode(node, [createFunction(node.statements.map(visit) as any)])
        } else if (node === systemJSCall && ts.isCallExpression(node)) {
            touched = true
            return ts.updateCall(node, ts.createIdentifier('arguments[0].register'), void 0, node.arguments)
        }
        return ts.visitEachChild(node, (child) => visit(child), context)
    }
    return ((node) => {
        const r = visit(node)
        if (!touched) throw new TypeError('Invalid transform')
        return r
    }) as (node: SourceFile) => SourceFile
}
/**
 * Return `(function () { [statements] })`
 */
function createFunction(statements: NodeArray<Statement>) {
    return ts.createExpressionStatement(
        ts.createParen(
            ts.createFunctionExpression(void 0, void 0, void 0, void 0, void 0, void 0, ts.createBlock(statements)),
        ),
    )
}
function getSystemJSRegisterCallArguments(x: Statement): void | CallExpression {
    if (!ts.isExpressionStatement(x)) return
    const expr = x.expression
    if (!ts.isCallExpression(expr)) return
    const callee = expr.expression
    if (!ts.isPropertyAccessExpression(callee)) return
    const { expression: left, name: right } = callee
    if (!ts.isIdentifier(left) || !ts.isIdentifier(right)) return
    if (left.text !== 'System' || right.text !== 'register') return
    return expr
}
