import ts, { SourceFile } from 'typescript'
/**
 * Transform any `this` to `(typeof this === "undefined" ? globalThis : this)`
 * @param context
 */
export function thisTransformation(context: ts.TransformationContext) {
    function visit(node: ts.Node): ts.VisitResult<ts.Node> {
        if (ts.isSourceFile(node)) {
            if (isInStrictMode(node.getChildAt(0) as ts.SyntaxList)) return node
        } else if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
            if (node.body) {
                const syntaxList = node
                    .getChildren()
                    .filter(x => x.kind === ts.SyntaxKind.SyntaxList)[0] as ts.SyntaxList
                if (isInStrictMode(syntaxList)) return node
            }
        } else if (node.kind === ts.SyntaxKind.ThisKeyword) {
            return ts.createParen(
                ts.createConditional(
                    ts.createBinary(
                        ts.createTypeOf(ts.createThis()),
                        ts.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                        ts.createStringLiteral('undefined'),
                    ),
                    ts.createIdentifier('globalThis'),
                    ts.createThis(),
                ),
            )
        }
        return ts.visitEachChild(node, child => visit(child), context)
    }
    return (node => {
        try {
            return visit(node)
        } catch {
            return node
        }
    }) as (node: SourceFile) => SourceFile
}
function isInStrictMode(node: ts.SyntaxList) {
    const first = node.getChildAt(0)
    if (!first) return false
    if (ts.isExpressionStatement(first)) {
        if (ts.isStringLiteral(first.expression)) {
            if (first.expression.text === 'use strict') return true
        }
    }
    return false
}
