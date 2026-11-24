export interface Args {
  cmd: string;
  url?: string;
  site?: string;
  token?: string;
  yes: boolean;
  dryRun: boolean;
  cwd?: string;
  install: boolean;
  offline: boolean;
  help: boolean;
}

export const HELP = `Usage: npx trail-analytics@latest init --url <TRAIL_URL> --site <SITE_ID> --token <CRAWL_TOKEN> [options]

Sets up Trail in a Next.js (15, 16) or Astro project in one step:
AI crawler capture, a first-party /t/* route with your host's edge geo, and the Trail script.

Options:
  --url <url>       Your Trail server, e.g. https://trail.example.com
  --site <id>       The site id in Trail
  --token <token>   A crawl token from Trail > AI visibility (kept in your env file only).
                    Use "--token -" to read it from stdin, or set TRAIL_CRAWL_TOKEN; on a
                    rerun it is read from your env file, and on a terminal it is asked for.
  --yes, -y         Apply without asking
  --dry-run         Show the changes and write nothing
  --cwd <dir>       Project directory (default: the current directory)
  --no-install      Do not install trail-analytics
  --offline         Skip the check that your Trail server is reachable and accepts the token
  --help, -h        Show this help

Environment: TRAIL_URL, TRAIL_SITE and TRAIL_CRAWL_TOKEN must be set on your host before you
deploy (init prints the exact commands). They are read by the server-side proxy at runtime.

Exit codes: 0 applied or nothing to do, 1 error, 2 unsupported framework or manual steps needed.
`;

/** Parses `init` flags. Throws an Error with a user-facing message on a bad flag. */
export function parseArgs(argv: string[]): Args {
  const a: Args = { cmd: '', yes: false, dryRun: false, install: true, offline: false, help: false };
  const val = (i: number, f: string) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`${f} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    const eq = t.indexOf('=');
    const [flag, inline] = t.startsWith('--') && eq > 0 ? [t.slice(0, eq), t.slice(eq + 1)] : [t, undefined];
    const take = () => (inline !== undefined ? inline : argv[++i] !== undefined ? argv[i] : val(i - 1, flag));
    switch (flag) {
      case '--url': a.url = take(); break;
      case '--site': a.site = take(); break;
      case '--token': a.token = take(); break;
      case '--cwd': a.cwd = take(); break;
      case '--yes': case '-y': a.yes = true; break;
      case '--dry-run': a.dryRun = true; break;
      case '--no-install': a.install = false; break;
      case '--offline': a.offline = true; break;
      case '--help': case '-h': a.help = true; break;
      default:
        if (!t.startsWith('-') && !a.cmd) a.cmd = t;
        else throw new Error(`unknown option ${t}`);
    }
  }
  return a;
}
