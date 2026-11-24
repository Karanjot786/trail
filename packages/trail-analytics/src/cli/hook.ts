import { applyEdits, boundNames, eolOf, identifierCount, importEdit, parse, stringValue, unwrapTs, type Ast, type Edit, type Node } from './ast';
import { withTrailSnippet } from './templates';

export const TRAIL_PATHS = ['/t/t.js', '/t/t.x.js', '/t/t.p.js', '/t/e'] as const;
export interface MatcherInfo { status: 'none' | 'added' | 'present' | 'dynamic'; narrow: boolean; /** The literal entries before init's edit. */ entries?: string[] }
export type HookEdit =
  | { kind: 'wrapped' | 'already'; after: string; matcher: MatcherInfo }
  | { kind: 'manual'; reason: string; snippet: string };

const NAMES = ['proxy', 'middleware'];
const TRAIL_IMPORT = 'trail-analytics/next/proxy';
const escRe = (c: string) => c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** A path-to-regexp style matcher source as a RegExp (the subset Next matchers use), or null. */
function toRegex(src: string): RegExp | null {
  let re = '';
  let i = 0;
  const group = (at: number): number => {
    let depth = 0;
    for (let j = at; j < src.length; j++) {
      if (src[j] === '\\') j++;
      else if (src[j] === '(') depth++;
      else if (src[j] === ')' && --depth === 0) return j;
    }
    return src.length - 1;
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      re += c + (src[i + 1] ?? '');
      i += 2;
    } else if (c === '(') {
      const e = group(i);
      re += src.slice(i, e + 1);
      i = e + 1;
    } else if (c === ':') {
      const m = /^:[A-Za-z_]\w*/.exec(src.slice(i));
      if (!m) { re += escRe(c); i++; continue; }
      i += m[0].length;
      let inner = '[^/]+';
      if (src[i] === '(') {
        const e = group(i);
        inner = src.slice(i + 1, e);
        i = e + 1;
      }
      const mod = '*+?'.includes(src[i] ?? '-') ? src[i++] : '';
      const slash = re.endsWith('/');
      if (slash) re = re.slice(0, -1);
      const seg = `(?:${slash ? '/' : ''}${inner})`;
      re += mod ? seg + mod : seg;
    } else {
      re += escRe(c);
      i++;
    }
  }
  try {
    return new RegExp(`^${re}/?$`);
  } catch {
    return null;
  }
}

const covers = (source: string, path: string) => toRegex(source)?.test(path) ?? false;
const catchAll = (s: string) => /^\/:\w+\*$/.test(s) || s === '/(.*)' || s.startsWith('/((?!');

function analyseMatcher(src: string, ast: Ast, already: boolean): { info: MatcherInfo; edits: Edit[] } {
  const none = { info: { status: 'none', narrow: false } as MatcherInfo, edits: [] as Edit[] };
  const dynamic = { info: { status: 'dynamic', narrow: false } as MatcherInfo, edits: [] as Edit[] };
  let cfg: Node;
  for (const n of ast.program.body) {
    if (n.type !== 'ExportNamedDeclaration' || n.declaration?.type !== 'VariableDeclaration') continue;
    for (const d of n.declaration.declarations) if (d.id.type === 'Identifier' && d.id.name === 'config') cfg = d;
  }
  if (!cfg) return none;
  const obj = unwrapTs(cfg.init);
  if (!obj || obj.type !== 'ObjectExpression') return dynamic;
  const prop = obj.properties.find((p: Node) => p.type === 'ObjectProperty' && !p.computed && (p.key.name === 'matcher' || p.key.value === 'matcher'));
  if (!prop) return obj.properties.some((p: Node) => p.type !== 'ObjectProperty') ? dynamic : none;
  const val = unwrapTs(prop.value);
  const els: Node[] = val.type === 'ArrayExpression' ? val.elements : [val];
  const entries: string[] = [];
  let quote = "'";
  for (const el of els) {
    if (!el) return dynamic;
    let s = stringValue(el);
    if (s !== undefined && (el.type === 'StringLiteral') && /['"]/.test(src[el.start] ?? '')) quote = src[el.start];
    if (s === undefined && el.type === 'ObjectExpression') {
      const sp = el.properties.find((p: Node) => p.type === 'ObjectProperty' && !p.computed && (p.key.name === 'source' || p.key.value === 'source'));
      s = sp ? stringValue(sp.value) : undefined;
    }
    if (s === undefined) return dynamic;
    entries.push(s);
  }
  if (val.type !== 'ArrayExpression' && val.type !== 'StringLiteral' && val.type !== 'TemplateLiteral') return dynamic;
  const narrow = !entries.some(catchAll);
  const missing = TRAIL_PATHS.filter((p) => (already ? !entries.some((s) => covers(s, p)) : !entries.includes(p)));
  if (!missing.length) return { info: { status: 'present', narrow, entries }, edits: [] };
  const add = missing.map((p) => quote + p + quote).join(', ');
  let edit: Edit;
  if (val.type !== 'ArrayExpression') edit = { start: val.start, end: val.end, text: `[${src.slice(val.start, val.end)}, ${add}]` };
  else if (!els.length) edit = { start: val.start + 1, end: val.start + 1, text: add };
  else edit = { start: els[els.length - 1].end, end: els[els.length - 1].end, text: `, ${add}` };
  return { info: { status: 'added', narrow, entries }, edits: [edit] };
}

/** Wraps an existing proxy/middleware export in `withTrail` and adds Trail's paths to its matcher. */
export function wrapHook(src: string, file: string, name: 'proxy' | 'middleware'): HookEdit {
  const ast = parse(src, file);
  const manual = (reason: string, exportName = name as string): HookEdit => ({ kind: 'manual', reason, snippet: withTrailSnippet(file, exportName) });
  if (!ast) return manual(`${file} could not be parsed`);
  const body: Node[] = ast.program.body;
  const already = body.some((n) => n.type === 'ImportDeclaration' && n.source.value === TRAIL_IMPORT);
  const m = analyseMatcher(src, ast, already);
  if (already) return { kind: 'already', after: applyEdits(src, m.edits), matcher: m.info };

  const defaults = body.filter((n) => n.type === 'ExportDefaultDeclaration');
  const named: { node: Node; name: string; decl?: Node; viaSpecifier?: boolean }[] = [];
  for (const n of body) {
    if (n.type !== 'ExportNamedDeclaration') continue;
    const d = n.declaration;
    if (d?.type === 'FunctionDeclaration' && NAMES.includes(d.id?.name)) named.push({ node: n, name: d.id.name, decl: d });
    else if (d?.type === 'VariableDeclaration') for (const v of d.declarations) if (v.id.type === 'Identifier' && NAMES.includes(v.id.name)) named.push({ node: n, name: v.id.name, decl: d });
    for (const s of n.specifiers ?? []) {
      const ex = s.exported?.name ?? s.exported?.value;
      if (NAMES.includes(ex) || ex === 'default') named.push({ node: n, name: ex, viaSpecifier: true });
    }
  }
  if (named.some((x) => x.viaSpecifier)) return manual(`${file} exports its handler through an export list or re-export`, named.find((x) => x.viaSpecifier)!.name === 'default' ? 'default' : (named.find((x) => x.viaSpecifier)!.name));
  if (defaults.length + named.length > 1) return manual(`${file} has more than one proxy/middleware export`);
  if (defaults.length + named.length === 0) return manual(`${file} has no proxy or middleware export`);

  const eol = eolOf(src);
  const bound = boundNames(ast);
  const local = bound.has('withTrail') ? 'trailWithTrail' : 'withTrail';
  if (bound.has(local)) return manual(`${file} already uses the names withTrail and trailWithTrail`);
  const importLine = local === 'withTrail' ? `import { withTrail } from '${TRAIL_IMPORT}'` : `import { withTrail as ${local} } from '${TRAIL_IMPORT}'`;
  const edits: Edit[] = [importEdit(src, ast, importLine), ...m.edits];
  const append = (stmt: string): Edit => ({ start: src.length, end: src.length, text: (src.endsWith('\n') ? '' : eol) + eol + stmt + eol });
  const wrapExpr = (e: Node) => edits.push({ start: e.start, end: e.end, text: `${local}(${src.slice(e.start, e.end)})` });

  if (defaults.length) {
    const node = defaults[0];
    const d = node.declaration;
    if (d.type === 'FunctionDeclaration') {
      let id = d.id?.name as string | undefined;
      if (!id) {
        id = 'trailUserProxy';
        if (bound.has(id)) return manual(`${file} already uses the name ${id}`, 'default');
        const kw = /^(?:async\s+)?function\s*(?:\*\s*)?/.exec(src.slice(d.start))!;
        const from = d.start + kw[0].trimEnd().length;
        edits.push({ start: from, end: d.start + kw[0].length, text: ` ${id}` });
      }
      edits.push({ start: node.start, end: d.start, text: '' }, append(`export default ${local}(${id});`));
    } else if (d.type === 'ClassDeclaration' || d.type.startsWith('TS')) {
      return manual(`${file} has an unsupported default export`, 'default');
    } else {
      wrapExpr(d);
    }
  } else {
    const x = named[0];
    if (x.decl!.type === 'FunctionDeclaration') {
      const handler = `${x.name}Handler`;
      if (bound.has(handler)) return manual(`${file} already uses the name ${handler}`, x.name);
      if (identifierCount(ast, x.name) !== 1) return manual(`${x.name} is referenced elsewhere in ${file}, so init cannot rename it`, x.name);
      edits.push({ start: x.node.start, end: x.decl!.start, text: '' }, { start: x.decl!.id.start, end: x.decl!.id.end, text: handler }, append(`export const ${x.name} = ${local}(${handler});`));
    } else {
      if (x.decl!.declarations.length !== 1) return manual(`${file} declares ${x.name} next to other variables`, x.name);
      const init = x.decl!.declarations[0].init;
      if (!init) return manual(`${x.name} has no initializer in ${file}`, x.name);
      wrapExpr(init);
    }
  }
  return { kind: 'wrapped', after: applyEdits(src, edits), matcher: m.info };
}
