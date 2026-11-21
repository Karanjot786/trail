import { resolve } from 'node:path';
import { gitIgnored as gitIgnoredIn, spawn as nodeSpawn, writeChanges } from './apply';
import { HELP, parseArgs } from './args';
import { detect } from './detect';
import { mask, renderDiff } from './diff';
import { nodeFs, plan } from './plan';
import { ask as askTTY } from './prompt';

export interface Io {
  stdout(s: string): void;
  stderr(s: string): void;
  isTTY: boolean;
  ask(q: string): Promise<boolean>;
  spawn(cmd: string, args: string[], opts: { cwd: string; shell: false }): Promise<number>;
  /** Overrides `git check-ignore` (tests). */
  gitIgnored?(rel: string): boolean;
}

const DONE = 'Done. Deploy, then open Trail → AI visibility: the card turns green when the first crawler request arrives.';

export async function main(argv: string[], io: Io): Promise<number> {
  let a;
  try {
    a = parseArgs(argv);
  } catch (e) {
    io.stderr(`trail-analytics: ${(e as Error).message}\n\n${HELP}`);
    return 1;
  }
  if (a.help || a.cmd === 'help') {
    io.stdout(HELP);
    return 0;
  }
  if (a.cmd !== 'init') {
    io.stderr(`trail-analytics: unknown command ${a.cmd || '(none)'}\n\n${HELP}`);
    return 1;
  }
  const secrets = a.token ? [a.token] : [];
  const say = (s: string) => io.stdout(mask(s, secrets));
  const missing = (['url', 'site', 'token'] as const).filter((k) => !a[k]);
  if (missing.length) {
    io.stderr(`trail-analytics: missing ${missing.map((k) => '--' + k).join(', ')}\n\n${HELP}`);
    return 1;
  }
  let url: URL;
  try {
    url = new URL(a.url!);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
  } catch {
    io.stderr('trail-analytics: --url must be an http(s) URL, e.g. https://trail.example.com\n');
    return 1;
  }
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(a.site!)) {
    io.stderr('trail-analytics: --site must be the site id from Trail (letters, digits, . _ -)\n');
    return 1;
  }
  const cwd = resolve(a.cwd ?? process.cwd());
  const project = detect(cwd);
  const p = plan(project, { url: url.origin + url.pathname.replace(/\/+$/, ''), site: a.site!, token: a.token! }, nodeFs(cwd, io.gitIgnored ?? gitIgnoredIn(cwd)));

  if (project.framework === 'unknown') {
    say(`No Next.js or Astro project found in ${cwd}.\n\n${p.manual.join('\n\n')}\n`);
    return 2;
  }
  const kind = project.framework === 'next' ? `Next.js ${project.nextMajor ?? '?'} (${project.router ?? 'no'} router, ${project.ext})` : `Astro (${project.astroOutput} output)`;
  say(`trail-analytics init: ${kind}\n\n`);
  if (p.changes.length) say(renderDiff(p.changes, secrets) + '\n');
  const install = a.install ? p.install : undefined;
  if (install) say(`Install: ${install.cmd} ${install.args.join(' ')}\n\n`);
  else if (p.install) say(`Not installing (--no-install). Run: ${p.install.cmd} ${p.install.args.join(' ')}\n\n`);
  for (const w of p.warnings) say(`Warning: ${w}\n\n`);
  for (const m of p.manual) say(`Manual step: ${m}\n\n`);
  const exit = p.manual.length ? 2 : 0;

  if (!p.changes.length && !install) {
    say('Nothing to change: Trail is already set up here.\n');
    return exit;
  }
  if (a.dryRun) {
    say('Dry run: nothing was written.\n');
    return exit;
  }
  if (!a.yes) {
    if (!io.isTTY) {
      io.stderr('Not a terminal: rerun with --yes to apply these changes.\n');
      return 1;
    }
    if (!(await io.ask('Apply these changes? [y/N] '))) {
      say('Nothing was written.\n');
      return 1;
    }
  }
  writeChanges(cwd, p.changes);
  for (const c of p.changes) say(`${c.before == null ? 'created' : 'updated'} ${c.path}\n`);
  if (install) {
    const code = await io.spawn(install.cmd, install.args, { cwd, shell: false });
    if (code !== 0) {
      io.stderr(`Install failed (${install.cmd} exited ${code}). Run it yourself: ${install.cmd} ${install.args.join(' ')}\n`);
      return 1;
    }
  }
  const envFile = project.framework === 'next' ? '.env.local' : '.env';
  say(`\nAlso add TRAIL_URL, TRAIL_SITE and TRAIL_CRAWL_TOKEN to your host's environment variables (${envFile} is only for local runs).\n${DONE}\n`);
  return exit;
}

const isMain = (() => {
  try {
    const argv1 = process.argv[1] ?? '';
    return /(?:^|[\\/])(cli\.js|trail-analytics)$/.test(argv1);
  } catch {
    return false;
  }
})();

if (isMain) {
  main(process.argv.slice(2), {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
    isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    ask: askTTY,
    spawn: nodeSpawn,
  }).then((code) => process.exit(code));
}
