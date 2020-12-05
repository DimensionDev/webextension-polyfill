// This transformer will transform
// ------------------ source ------------------
// Math = {};
// {
//     let Math = 1
//     Math = 2;
// }
// ------------------ into ------------------
// ((globalThis) => {
//     const window = globalThis
//     let Math = globalThis.Math
//     _Math_setter_ = (val) => ((globalThis.Math = Math), val)
//     ;(() => {
// _Math_setter_(Math = {});
// {
//     let Math = 1
//     _Math_setter_(Math = 2);
// }
//     })()
// })
import ts, {
    Expression,
    Identifier,
    isBinaryExpression,
    isDeleteExpression,
    isIdentifier,
    isParenthesizedExpression,
    isPostfixUnaryExpression,
    isPrefixUnaryExpression,
    Node,
    SourceFile,
    SyntaxKind,
    TransformerFactory,
    flattenDestructuringAssignment,
    isDestructuringAssignment,
    isBindingPattern,
    FlattenLevel,
    isVariableStatement,
} from 'typescript'

export function staticCapture(): TransformerFactory<SourceFile> {
    return (context) => {
        return (sf) => {
            const captured: string[] = []
            const capturedSetter = new Map<string, Identifier>()
            return visit(sf) as SourceFile

            function visit(node: ts.Node): ts.VisitResult<ts.Node> {
                if (isIdentifier(node)) captured.push(node.text)
                if (isDestructuringAssignment(node)) {
                    // it's impossible to track variable changes in a destructuring pattern
                    // so we flatten it back to ES5
                    node = flattenDestructuringAssignment(
                        node,
                        visit,
                        context,
                        FlattenLevel.All,
                        /** needsValue */ true /** because I don't know what it is used for */,
                    )
                    return visit(node)
                }
                const tracked = trackUpdatedIdentifiers(node)
                tracked && console.log(tracked)
                return ts.visitEachChild(node, (child) => visit(child), context)
            }
            function wrapCapturedSetter(name: string) {
                if (capturedSetter.has(name)) return context
            }
        }
    }
}

// Following syntax are tracked
// a++ ++a a-- --a
// delete a
// AssignmentOperator:one of
// *=    /=    %=    +=   -=   <<=   >>=   >>>=   &=   ^=   |=   **=
// &&=   ||=   ??=   =
function trackUpdatedIdentifiers(node: Node): string | undefined {
    if (isPostfixUnaryExpression(node) || isPrefixUnaryExpression(node)) {
        const ref = unwrapParenthesizedExpression(node.operand)
        if (isIdentifier(ref)) return ref.text
    } else if (isDeleteExpression(node)) {
        const ref = unwrapParenthesizedExpression(node.expression)
        if (isIdentifier(ref)) return ref.text
    } else if (isBinaryExpression(node)) {
        if (
            [
                SyntaxKind.AsteriskEqualsToken,
                SyntaxKind.SlashEqualsToken,
                SyntaxKind.PercentEqualsToken,
                SyntaxKind.PlusEqualsToken,
                SyntaxKind.MinusEqualsToken,
                SyntaxKind.LessThanLessThanEqualsToken,
                SyntaxKind.GreaterThanGreaterThanEqualsToken,
                SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
                SyntaxKind.AmpersandEqualsToken,
                SyntaxKind.CaretEqualsToken,
                SyntaxKind.BarEqualsToken,
                SyntaxKind.AsteriskAsteriskEqualsToken,
                // @ts-expect-error wait for upgrade
                SyntaxKind.AmpersandAmpersandEqualsToken,
                // @ts-expect-error
                SyntaxKind.BarBarEqualsToken,
                // @ts-expect-error
                SyntaxKind.QuestionQuestionEqualsToken,
                SyntaxKind.EqualsToken,
            ].includes(node.operatorToken.kind)
        ) {
            // if an identifier has no text, it is a temp variable, don't track it.
            if (isIdentifier(node.left) && node.left.text) return node.left.text
        }
    }
    return undefined
}
function unwrapParenthesizedExpression(node: Expression): Expression {
    if (!isParenthesizedExpression(node)) return node
    return unwrapParenthesizedExpression(node.expression)
}
class LexicalScope {
    currentScope: string[] = []
    constructor(public parent: LexicalScope | null) {}
    isInScope(name: string): boolean {
        if (this.currentScope.includes(name)) return true
        return Boolean(this.parent?.isInScope(name))
    }
}
declare module 'typescript' {
    function flattenDestructuringAssignment(
        node: ts.VariableDeclaration | ts.DestructuringAssignment,
        visitor: ((node: ts.Node) => ts.VisitResult<ts.Node>) | undefined,
        context: ts.TransformationContext,
        level: ts.FlattenLevel,
        needsValue?: boolean,
    ): ts.Expression
    const enum FlattenLevel {
        All,
        ObjectRest,
    }
    function isDestructuringAssignment(node: ts.Node): node is ts.DestructuringAssignment
    function isBindingPattern(node: ts.Node | undefined): node is ts.BindingPattern
}
