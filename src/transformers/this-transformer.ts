import ts, { SourceFile, Statement } from 'typescript'
/**
 * Transform any `this` to `(x =>
    typeof x === 'undefined'
        ? globalThis
        : x && Object.getPrototypeOf(x) === null && Object.isFrozen(x)
        ? globalThis
        : x)(this)`
 * The frozen check is to bypass systemjs's nullContext
 * @param context
 */
export function thisTransformation(context: ts.TransformationContext) {
    function visit(node: ts.Node): ts.VisitResult<ts.Node> {
        if (ts.isSourceFile(node)) {
            if (isInStrictMode(node.statements)) return node
        } else if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
            if (node.body) {
                if (isInStrictMode(node.body.statements)) return node
            }
        } else if (node.kind === ts.SyntaxKind.ThisKeyword) {
            return ts.createCall(
                ts.createParen(
                    ts.createArrowFunction(
                        void 0,
                        void 0,
                        [ts.createParameter(void 0, void 0, void 0, ts.createIdentifier('x'), void 0, void 0, void 0)],
                        void 0,
                        ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                        ts.createConditional(
                            ts.createBinary(
                                ts.createTypeOf(ts.createIdentifier('x')),
                                ts.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                                ts.createStringLiteral('undefined'),
                            ),
                            ts.createIdentifier('globalThis'),
                            ts.createConditional(
                                ts.createBinary(
                                    ts.createBinary(
                                        ts.createIdentifier('x'),
                                        ts.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
                                        ts.createBinary(
                                            ts.createCall(
                                                ts.createPropertyAccess(
                                                    ts.createIdentifier('Object'),
                                                    ts.createIdentifier('getPrototypeOf'),
                                                ),
                                                void 0,
                                                [ts.createIdentifier('x')],
                                            ),
                                            ts.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                                            ts.createNull(),
                                        ),
                                    ),
                                    ts.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
                                    ts.createCall(
                                        ts.createPropertyAccess(
                                            ts.createIdentifier('Object'),
                                            ts.createIdentifier('isFrozen'),
                                        ),
                                        void 0,
                                        [ts.createIdentifier('x')],
                                    ),
                                ),
                                ts.createIdentifier('globalThis'),
                                ts.createIdentifier('x'),
                            ),
                        ),
                    ),
                ),
                void 0,
                [ts.createThis()],
            )
        }
        return ts.visitEachChild(node, child => visit(child), context)
    }
    return (node => {
        return visit(node)
    }) as (node: SourceFile) => SourceFile
}
function isInStrictMode(node: ts.NodeArray<Statement>) {
    const first = node[0]
    if (!first) return false
    if (ts.isExpressionStatement(first)) {
        if (ts.isStringLiteralLike(first.expression)) {
            if (first.expression.text === 'use strict') return true
        }
    }
    return false
}
