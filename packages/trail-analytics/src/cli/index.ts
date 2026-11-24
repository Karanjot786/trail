import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gitIgnored as gitIgnoredIn, gitTracked as gitTrackedIn, globalPmVersion, spawn as nodeSpawn, spawnOptions, writeChanges } from './apply';
import { HELP, parseArgs } from './args';
import { detect } from './detect';
import { checkTrail, detectHost, envSteps } from './host';
import { mask, renderDiff } from './diff';
import { verify } from './verify';
import { envFileFor, nodeFs, plan, readEnvValue } from './plan';
import { ask as askTTY, askSecret as askSecretTTY, readStdin as readStdinNode } from './prompt';

export interface Io {
  stdout(s: string): void;
  stderr(s: string): void;
  isTTY: boolean;
  ask(q: string): Promise<boolean>;
  spawn(cmd: string, args: string[], opts: { cwd: string; shell: boolean }): Promise<number>;
  /** The globally installed version of a package manager (tests inject it). */
  pmVersion?(pm: string): string | undefined;
  /** Overrides `git check-ignore` (tests). */
  gitIgnored?(rel: string): boolean;
  /** Overrides `git ls-files --error-unmatch` (tests). */
  gitTracked?(rel: string): boolean;
  env: Record<string, string | undefined>;
  readStdin(): Promise<string>;
  /** Prompts for a secret on a TTY without echoing it. */
  askSecret(q: string): Promise<string>;
  /** Used for the server check (tests inject it). Defaults to the global fetch. */
  fetch?: typeof fetch;
}

const PRIVATE_V4 = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
/** http is only acceptable where the crawl token cannot cross the public internet. */
function httpAllowed(host: string): boolean {
  return host === 'localhost' || host === '[::1]' || (/^\d+\.\d+\.\d+\.\d+$/.test(host) && PRIVATE_V4.test(host));
}

const DRY_BANNER = 'DRY RUN: nothing will be written. Add --yes to apply.';
const LOCALHOST_NOTE = 'Testing: Trail ignores localhost and automated browsers. To see events locally add dev to the tag (<Analytics … dev />), or deploy and run: npx trail-analytics verify --url https://<your-site>';
const CLOUDFLARE_NOTE = 'If Cloudflare sits in front of your site: Security → Bots → "Block AI bots" and the managed robots.txt can stop real AI crawlers; a curl with a fake GPTBot user agent getting 403 is expected.';

const readDeps = (cwd: string): Record<string, string> => {
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    return { ...pkg.devDependencies, ...pkg.dependencies };
  } catch {
    return {};
  }
};

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
  if (a.cmd === 'verify') {
    if (!a.url) {
      io.stderr('trail-analytics: verify needs --url https://your-site\n');
      return 1;
    }
    let target: URL;
    try {
      target = new URL(a.url);
      if (target.protocol !== 'https:' && target.protocol !== 'http:') throw new Error();
    } catch {
      io.stderr('trail-analytics: --url must be an http(s) URL\n');
      return 1;
    }
    const checks = await verify({ url: target.href, site: a.site, api: a.api }, io.fetch ?? globalThis.fetch);
    if (a.json) io.stdout(JSON.stringify(checks, null, 2) + '\n');
    else for (const c of checks) io.stdout(`${c.ok === true ? 'ok  ' : c.ok === 'warn' ? 'warn' : 'FAIL'}  ${c.name.padEnd(8)} ${c.detail}\n`);
    return checks.some((c) => c.ok === false) ? 1 : 0;
  }
  if (a.cmd !== 'init') {
    io.stderr(`trail-analytics: unknown command ${a.cmd || '(none)'}\n\n${HELP}`);
    return 1;
  }
  const cwd = resolve(a.cwd ?? process.cwd());
  const project = detect(cwd);
  const envFile = envFileFor(project);
  const existingEnv = (() => {
    try {
      return readFileSync(join(cwd, envFile), 'utf8');
    } catch {
      return null;
    }
  })();
  const oldToken = readEnvValue(existingEnv, 'TRAIL_CRAWL_TOKEN');
  let token = a.token;
  let literal = false;
  if (token === '-') token = (await io.readStdin()).trim();
  else if (token) literal = true;
  token ||= io.env.TRAIL_CRAWL_TOKEN?.trim() || oldToken;
  const missing: string[] = (['url', 'site'] as const).filter((k) => !a[k]).map((k) => '--' + k);
  if (!token && !missing.length && io.isTTY) token = (await io.askSecret('Trail crawl token (input hidden): ')).trim();
  if (!token) missing.push('--token (or set TRAIL_CRAWL_TOKEN)');
  if (missing.length) {
    io.stderr(`trail-analytics: missing ${missing.join(', ')}\n\n${HELP}`);
    return 1;
  }
  const secrets = [token!, oldToken].filter((x): x is string => Boolean(x));
  const say = (s: string) => io.stdout(mask(s, secrets));
  let url: URL;
  try {
    url = new URL(a.url!);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
  } catch {
    io.stderr('trail-analytics: --url must be an http(s) URL, e.g. https://trail.example.com\n');
    return 1;
  }
  if (url.protocol === 'http:' && !httpAllowed(url.hostname)) {
    io.stderr('trail-analytics: --url must be https (the crawl token would travel in clear text)\n');
    return 1;
  }
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(a.site!)) {
    io.stderr('trail-analytics: --site must be the site id from Trail (letters, digits, . _ -)\n');
    return 1;
  }
  const p = plan(project, { url: url.origin + url.pathname.replace(/\/+$/, ''), site: a.site!, token: token! }, nodeFs(cwd, io.gitIgnored ?? gitIgnoredIn(cwd), io.gitTracked ?? gitTrackedIn(cwd)));

  if (project.framework === 'unknown') {
    say(`No Next.js or Astro project found in ${cwd}.\n\n${p.manual.join('\n\n')}\n`);
    return 2;
  }
  const dry = a.dryRun || (!a.yes && !io.isTTY);
  say(dry ? `${DRY_BANNER}\n\n` : 'trail-analytics init\n\n');
  const kind = project.framework === 'next' ? `Next.js ${project.nextMajor ?? '?'} (${project.router ?? 'no'} router, ${project.ext})` : `Astro (${project.astroOutput} output)`;
  say(`Detected: ${kind}\n\n`);
  if (!a.offline) {
    const c = await checkTrail(url.origin + url.pathname.replace(/\/+$/, ''), a.site!, token!, io.fetch ?? globalThis.fetch);
    if (!c.ok) {
      io.stderr(mask(`Error: ${c.lines.join(' ')}\nNothing was written. Fix the problem, or pass --offline to skip this check.\n`, secrets));
      return 1;
    }
    say(c.lines.join('\n') + '\n\n');
  }
  if (p.changes.length) say(renderDiff(p.changes, secrets) + '\n');
  const install = a.install ? p.install : undefined;
  const where = p.install && p.install.cwd !== cwd ? ` (in ${p.install.cwd})` : '';
  if (install) say(`Install: ${install.cmd} ${install.args.join(' ')}${where}\n\n`);
  else if (p.install) say(`Not installing (--no-install). Run: ${p.install.cmd} ${p.install.args.join(' ')}${where}\n\n`);
  for (const w of p.warnings) say(`Warning: ${w}\n\n`);
  for (const m of p.manual) say(`Manual step: ${m}\n\n`);
  const exit = p.manual.length ? 2 : 0;
  const host = detectHost(cwd, project.ws, readDeps(cwd));
  say(`Environment (set before you deploy):\n${envSteps(host, { url: url.origin + url.pathname.replace(/\/+$/, ''), site: a.site!, envFile })}\n\n${LOCALHOST_NOTE}\n\n${CLOUDFLARE_NOTE}\n\n`);
  const finish = (code: number) => {
    if (dry) say(`${DRY_BANNER}\n`);
    return code;
  };

  if (!p.changes.length && !install) {
    say('Nothing to change: Trail is already set up here.\n');
    return finish(exit);
  }
  if (a.dryRun) return finish(exit);
  if (!a.yes) {
    if (!io.isTTY) {
      io.stderr('Not a terminal: rerun with --yes to apply these changes.\n');
      return finish(1);
    }
    if (!(await io.ask('Apply these changes? [y/N] '))) {
      say('Nothing was written.\n');
      return 1;
    }
  }
  if (literal) say('Tip: the token is now in your shell history. Next time pipe it: printf %s "$TOKEN" | npx trail-analytics init … --token -\n\n');
  writeChanges(cwd, p.changes);
  for (const c of p.changes) say(`${c.before == null ? 'created' : 'updated'} ${c.path}\n`);
  if (install) {
    const pinned = project.ws.pmVersion;
    const have = pinned ? (io.pmVersion ?? globalPmVersion)(install.cmd) : undefined;
    if (pinned && have && have !== pinned) say(`Your repo pins ${install.cmd}@${pinned}; you have ${have}. Init ran ${install.cmd} install anyway; if the lockfile changes more than the trail-analytics lines, run it with npx ${install.cmd}@${pinned} install.\n\n`);
    const code = await io.spawn(install.cmd, install.args, { cwd: install.cwd, ...spawnOptions(process.platform) });
    if (code !== 0) {
      io.stderr(`Install failed (${install.cmd} exited ${code}). Run it yourself${where}: ${install.cmd} ${install.args.join(' ')}\nAll other changes were written.\n`);
      return 1;
    }
  }
  say(`\n${envFile} is only for local runs: set TRAIL_URL, TRAIL_SITE and TRAIL_CRAWL_TOKEN on your host before you deploy (commands above).\n${DONE}\n`);
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
    env: process.env,
    readStdin: readStdinNode,
    askSecret: askSecretTTY,
  }).then((code) => process.exit(code));
}
