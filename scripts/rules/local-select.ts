import ts from "typescript";

/** Local choices must use the shared nonmodal field instead of acquiring global page locks. */
export function importsPageLockingSelect(file: string, content: string): boolean {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  let forbidden = false;
  const localSelect = (name: string) =>
    /(?:^|\/)ui\/select(?:\.[cm]?[jt]sx?)?$/.test(name) || name === "@radix-ui/react-select";
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const named = node.importClause?.namedBindings;
      if (
        node.importClause?.isTypeOnly ||
        (named &&
          ts.isNamedImports(named) &&
          !node.importClause?.name &&
          named.elements.every((item) => item.isTypeOnly))
      )
        return;
      forbidden ||= localSelect(node.moduleSpecifier.text);
      const bindings = node.importClause?.namedBindings;
      if (node.moduleSpecifier.text === "radix-ui" && bindings && ts.isNamedImports(bindings))
        forbidden ||= bindings.elements.some(
          (item) => !item.isTypeOnly && (item.propertyName ?? item.name).text === "Select",
        );
    }
    if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      forbidden ||= localSelect(node.moduleSpecifier.text);
      if (
        node.moduleSpecifier.text === "radix-ui" &&
        node.exportClause &&
        ts.isNamedExports(node.exportClause)
      )
        forbidden ||= node.exportClause.elements.some(
          (item) => !item.isTypeOnly && (item.propertyName ?? item.name).text === "Select",
        );
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteralLike(argument)) forbidden ||= localSelect(argument.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return forbidden;
}
