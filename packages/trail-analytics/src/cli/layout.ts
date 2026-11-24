import { applyEdits, boundNames, findAll, importEdit, parse, stringValue, eolOf, type Edit, type Node } from './ast';
import type { PlanFs } from './plan';

const LAYOUT_FILES = ['tsx', 'jsx', 'ts', 'js'].map((e) => `layout.${e}`);
const SEGMENT = /^(?:\(.+\)|\[.+\])$/;
const TRAIL_IMPORT = 'trail-analytics/next';

export type LayoutEdit = { after: string; local: string } | { manual: string } | null;
export interface TagAttrs { site: string; src: string; api: string }

const jsxName = (el: Node): string | undefined => (el.openingElement.name.type === 'JSXIdentifier' ? el.openingElement.name.name : undefined);

function hasHtml(src: string, file: string): boolean {
  const ast = parse(src, file);
  if (!ast) return /<html[\s>]/.test(src);
  return findAll(ast.program, 'JSXElement').some((e) => jsxName(e) === 'html');
}

/** layout.* in appDir, then one or two levels down through (group) and [param] dirs; only files whose JSX has an <html> element. */
export function findRootLayouts(fs: PlanFs, appDir: string): string[] {
  const dirs = [appDir];
  const segs = (d: string) => fs.list(d).filter((n) => SEGMENT.test(n) && fs.isDir(`${d}/${n}`)).sort().map((n) => `${d}/${n}`);
  const l1 = segs(appDir);
  dirs.push(...l1);
  for (const d of l1) dirs.push(...segs(d));
  const out: string[] = [];
  for (const d of dirs) {
    const file = LAYOUT_FILES.map((f) => `${d}/${f}`).find((f) => fs.read(f) !== null);
    if (file && hasHtml(fs.read(file)!, file)) out.push(file);
  }
  return out;
}

/** The line number (1-based) of every hand-written <script> that loads the Trail script. */
export function handScriptLines(src: string, file: string): number[] {
  const hit = /\/_?t\/t\.js|\/_t\/t\.js/;
  const lines = new Set<number>();
  const ast = parse(src, file);
  if (ast) {
    for (const e of findAll(ast.program, 'JSXElement')) {
      const n = jsxName(e);
      if (n !== 'script' && n !== 'Script') continue;
      const a = e.openingElement.attributes.find((x: Node) => x.type === 'JSXAttribute' && x.name.name === 'src');
      const v = a?.value && (stringValue(a.value) ?? stringValue(a.value.expression));
      if (v && hit.test(v)) lines.add(e.loc.start.line);
    }
  }
  const re = /<script\b[^>]*?(?:\/_t\/t\.js|\/t\/t\.js)/g;
  for (let m; (m = re.exec(src)); ) lines.add(src.slice(0, m.index).split('\n').length);
  return [...lines].sort((a, b) => a - b);
}

/** Adds, aliases or updates the Trail tag. null means the file is already correct. */
export function editLayout(src: string, file: string, tag: TagAttrs): LayoutEdit {
  const ast = parse(src, file);
  if (!ast) return { manual: `${file} could not be parsed; add <Analytics site="${tag.site}" src="${tag.src}" api="${tag.api}" /> inside the <body> yourself.` };
  const body: Node[] = ast.program.body;
  let local: string | undefined;
  let imported = false;
  for (const n of body) {
    if (n.type !== 'ImportDeclaration' || n.source.value !== TRAIL_IMPORT) continue;
    for (const s of n.specifiers) if (s.type === 'ImportSpecifier' && (s.imported.name ?? s.imported.value) === 'Analytics') (local = s.local.name), (imported = true);
  }
  const want: [string, string][] = [['site', tag.site], ['src', tag.src], ['api', tag.api]];
  const elements = findAll(ast.program, 'JSXElement');
  if (local) {
    const el = elements.find((e) => jsxName(e) === local);
    if (el) {
      const op = el.openingElement;
      const edits: Edit[] = [];
      const missing: string[] = [];
      for (const [k, v] of want) {
        const a = op.attributes.find((x: Node) => x.type === 'JSXAttribute' && x.name.name === k);
        if (!a) missing.push(` ${k}="${v}"`);
        else if (a.value?.type === 'StringLiteral' && a.value.value !== v) edits.push({ start: a.value.start, end: a.value.end, text: `"${v}"` });
        else if (!a.value) edits.push({ start: a.end, end: a.end, text: `="${v}"` });
      }
      if (missing.length) {
        const last = op.attributes[op.attributes.length - 1];
        const at = last ? last.end : op.name.end;
        edits.push({ start: at, end: at, text: missing.join('') });
      }
      return edits.length ? { after: applyEdits(src, edits), local } : null;
    }
  }
  const bound = boundNames(ast);
  const name = local ?? (!bound.has('Analytics') ? 'Analytics' : !bound.has('TrailAnalytics') ? 'TrailAnalytics' : undefined);
  if (!name) return { manual: `${file} already uses the names Analytics and TrailAnalytics; import Analytics from '${TRAIL_IMPORT}' under another name and add <… site="${tag.site}" src="${tag.src}" api="${tag.api}" /> inside the <body>.` };
  const bodies = elements.filter((e) => jsxName(e) === 'body');
  if (bodies.length !== 1 || !bodies[0].closingElement) return { manual: `Found ${bodies.length} <body> elements in ${file}; add <${name} …/> inside the one that wraps your pages.` };
  const b = bodies[0];
  const eol = eolOf(src);
  const text = `<${name} site="${tag.site}" src="${tag.src}" api="${tag.api}" />`;
  const kids = b.children.filter((c: Node) => !(c.type === 'JSXText' && c.value.trim() === ''));
  const edits: Edit[] = [];
  const last = kids[kids.length - 1];
  if (last) {
    // JSXText children start at the text, which may include leading whitespace: find the first real character.
    const first = last.type === 'JSXText' ? last.start + (last.value.length - last.value.trimStart().length) : last.start;
    const lineStart = src.lastIndexOf('\n', first - 1) + 1;
    const lead = src.slice(lineStart, first);
    const end = last.type === 'JSXText' ? last.end - (last.value.length - last.value.trimEnd().length) : last.end;
    edits.push(/^[ \t]*$/.test(lead) ? { start: end, end, text: eol + lead + text } : { start: b.closingElement.start, end: b.closingElement.start, text });
  } else {
    edits.push({ start: b.closingElement.start, end: b.closingElement.start, text });
  }
  if (!imported) edits.push(importEdit(src, ast, name === 'Analytics' ? `import { Analytics } from '${TRAIL_IMPORT}'` : `import { Analytics as ${name} } from '${TRAIL_IMPORT}'`));
  return { after: applyEdits(src, edits), local: name };
}
