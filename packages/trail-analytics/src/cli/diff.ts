export interface Change { path: string; before: string | null; after: string }

const mask = (s: string, secrets: string[]) => secrets.filter(Boolean).reduce((t, x) => t.split(x).join('••••' + x.slice(-4)), s);
const lines = (s: string | null) => (s == null || s === '' ? [] : s.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n'));

type Op = [' ' | '-' | '+', string];

function ops(a: string[], b: string[]): Op[] {
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: Op[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) (out.push([' ', a[i]]), i++, j++);
    else if (L[i + 1][j] >= L[i][j + 1]) out.push(['-', a[i++]]);
    else out.push(['+', b[j++]]);
  }
  while (i < n) out.push(['-', a[i++]]);
  while (j < m) out.push(['+', b[j++]]);
  return out;
}

/** A unified diff of every change, with each secret shown as ••••last4. */
export function renderDiff(changes: Change[], secrets: string[]): string {
  const out: string[] = [];
  for (const c of changes) {
    const o = ops(lines(c.before), lines(c.after));
    out.push(`--- ${c.before == null ? '/dev/null' : 'a/' + c.path}`, `+++ b/${c.path}`);
    const ctx = 3;
    const idx = o.flatMap((x, i) => (x[0] === ' ' ? [] : [i]));
    const groups: [number, number][] = [];
    for (const i of idx) {
      const g = groups[groups.length - 1];
      if (g && i - g[1] <= ctx * 2 + 1) g[1] = i;
      else groups.push([i, i]);
    }
    for (const [f, l] of groups) {
      const start = Math.max(0, f - ctx), end = Math.min(o.length, l + ctx + 1);
      let ai = 1, bi = 1;
      for (let x = 0; x < start; x++) { if (o[x][0] !== '+') ai++; if (o[x][0] !== '-') bi++; }
      const hunk = o.slice(start, end);
      const an = hunk.filter((h) => h[0] !== '+').length, bn = hunk.filter((h) => h[0] !== '-').length;
      out.push(`@@ -${an ? ai : ai - 1},${an} +${bn ? bi : bi - 1},${bn} @@`);
      for (const [t, line] of hunk) out.push(t + line);
    }
  }
  return mask(out.join('\n') + (out.length ? '\n' : ''), secrets);
}

export { mask };
