import { parse, stringValue, unwrapTs, type Node } from './ast';
import type { PlanFs } from './plan';

export interface NextConfigInfo { output?: string; basePath?: string; trailingSlash?: boolean; i18n?: boolean; file?: string }

const FILES = ['next.config.ts', 'next.config.mjs', 'next.config.js', 'next.config.cjs', 'next.config.mts'];
const keyName = (p: Node) => (p.computed ? undefined : (p.key.name ?? p.key.value));

/** Reads literal output, basePath, trailingSlash and i18n from next.config.*; a value that is not a literal stays undefined. */
export function readNextConfig(fs: PlanFs): NextConfigInfo {
  const file = FILES.find((f) => fs.read(f) !== null);
  if (!file) return {};
  const src = fs.read(file)!;
  const ast = parse(src, file);
  const info: NextConfigInfo = { file };
  if (!ast) return info;
  const top = new Map<string, Node>();
  for (const n of ast.program.body) {
    const d = n.type === 'ExportNamedDeclaration' ? n.declaration : n;
    if (d?.type === 'VariableDeclaration') for (const v of d.declarations) if (v.id.type === 'Identifier' && v.init) top.set(v.id.name, v.init);
  }
  const resolve = (n: Node, depth: number): Node | undefined => {
    n = unwrapTs(n);
    if (!n || depth > 3) return undefined;
    if (n.type === 'ObjectExpression') return n;
    if (n.type === 'Identifier') return top.has(n.name) ? resolve(top.get(n.name), depth + 1) : undefined;
    if (n.type === 'CallExpression') {
      for (const a of n.arguments) {
        const r = resolve(a, depth + 1);
        if (r) return r;
      }
    }
    return undefined;
  };
  let root: Node | undefined;
  for (const n of ast.program.body) {
    if (n.type === 'ExportDefaultDeclaration') root = resolve(n.declaration, 0);
    else if (n.type === 'ExpressionStatement' && n.expression.type === 'AssignmentExpression' && /module\s*\.\s*exports/.test(src.slice(n.expression.left.start, n.expression.left.end))) root = resolve(n.expression.right, 0);
  }
  if (!root) return info;
  for (const p of root.properties) {
    if (p.type !== 'ObjectProperty') continue;
    const v = unwrapTs(p.value);
    switch (keyName(p)) {
      case 'output': info.output = stringValue(v); break;
      case 'basePath': info.basePath = stringValue(v); break;
      case 'trailingSlash': if (v.type === 'BooleanLiteral') info.trailingSlash = v.value; break;
      case 'i18n': if (v.type === 'ObjectExpression') info.i18n = true; break;
    }
  }
  return info;
}
