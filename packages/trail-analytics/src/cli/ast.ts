import { parse as babelParse } from '@babel/parser';

/** A Babel AST node, loosely typed: the CLI only reads a few fields. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Node = any;
export interface Ast { program: Node; tokens: Node[]; [k: string]: unknown }
export interface Edit { start: number; end: number; text: string }

/** Parses `src`; null on a syntax error. TypeScript for .ts/.tsx/.mts/.cts, JSX except in plain .ts. */
export function parse(src: string, file: string): Ast | null {
  const ts = /\.[cm]?tsx?$/.test(file);
  const plugins: ('typescript' | 'jsx')[] = ts ? ['typescript'] : [];
  if (!/\.[cm]?ts$/.test(file)) plugins.push('jsx');
  try {
    return babelParse(src, { sourceType: 'module', plugins, tokens: true, errorRecovery: false, allowReturnOutsideFunction: true }) as unknown as Ast;
  } catch {
    return null;
  }
}

/** Top-level import locals plus top-level declaration names. */
export function boundNames(ast: Ast): Set<string> {
  const out = new Set<string>();
  const decl = (d: Node) => {
    if (!d) return;
    if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration' || d.type === 'TSEnumDeclaration') && d.id) out.add(d.id.name);
    else if (d.type === 'VariableDeclaration') for (const v of d.declarations) pattern(v.id);
    else if ((d.type === 'TSInterfaceDeclaration' || d.type === 'TSTypeAliasDeclaration') && d.id) out.add(d.id.name);
  };
  const pattern = (p: Node) => {
    if (!p) return;
    if (p.type === 'Identifier') out.add(p.name);
    else if (p.type === 'ObjectPattern') for (const x of p.properties) pattern(x.value ?? x.argument);
    else if (p.type === 'ArrayPattern') for (const x of p.elements) pattern(x);
    else if (p.type === 'AssignmentPattern') pattern(p.left);
    else if (p.type === 'RestElement') pattern(p.argument);
  };
  for (const n of ast.program.body) {
    if (n.type === 'ImportDeclaration') for (const s of n.specifiers) out.add(s.local.name);
    else if (n.type === 'ExportNamedDeclaration' || n.type === 'ExportDefaultDeclaration') decl(n.declaration);
    else decl(n);
  }
  return out;
}

export const eolOf = (src: string): string => (/\r\n/.test(src) ? '\r\n' : '\n');

/** The edit that adds `line` (no trailing semicolon) after the last top-level import, or at the top. Keeps EOL and semicolon style. */
export function importEdit(src: string, ast: Ast, line: string): Edit {
  const eol = eolOf(src);
  const imports = ast.program.body.filter((n: Node) => n.type === 'ImportDeclaration');
  const last = imports[imports.length - 1];
  if (!last) {
    const dirs: Node[] = ast.program.directives ?? [];
    const d = dirs[dirs.length - 1];
    return d ? { start: d.end, end: d.end, text: `${eol}${line};` } : { start: 0, end: 0, text: `${line};${eol}` };
  }
  const semi = src[last.end - 1] === ';' ? ';' : imports.length ? '' : ';';
  return { start: last.end, end: last.end, text: eol + line + semi };
}

export function insertImport(src: string, ast: Ast, line: string): string {
  return applyEdits(src, [importEdit(src, ast, line)]);
}

/** Applies non-overlapping edits expressed in offsets of the original text. */
export function applyEdits(src: string, edits: Edit[]): string {
  let out = src;
  for (const e of [...edits].sort((a, b) => b.start - a.start || b.end - a.end)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/** Number of identifier tokens spelled `name`. */
export function identifierCount(ast: Ast, name: string): number {
  return ast.tokens.filter((t: Node) => t.type?.label === 'name' && t.value === name).length;
}

export const unwrapTs = (n: Node): Node => {
  while (n && (n.type === 'TSAsExpression' || n.type === 'TSSatisfiesExpression' || n.type === 'TSNonNullExpression' || n.type === 'ParenthesizedExpression' || n.type === 'TSTypeAssertion')) n = n.expression;
  return n;
};

/** The string value of a plain string or expression-free template literal, else undefined. */
export function stringValue(n: Node): string | undefined {
  if (!n) return undefined;
  if (n.type === 'StringLiteral') return n.value;
  if (n.type === 'TemplateLiteral' && n.expressions.length === 0) return n.quasis[0].value.cooked ?? undefined;
  return undefined;
}

/** Every node of `type` under `root`, in source order. */
export function findAll(root: Node, type: string, out: Node[] = []): Node[] {
  if (!root || typeof root !== 'object') return out;
  if (Array.isArray(root)) {
    for (const x of root) findAll(x, type, out);
    return out;
  }
  if (root.type === type) out.push(root);
  for (const k of Object.keys(root)) {
    if (k === 'loc' || k === 'tokens' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments' || k === 'extra') continue;
    const v = root[k];
    if (v && typeof v === 'object') findAll(v, type, out);
  }
  return out;
}
