import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

export function ask(question: string): Promise<boolean> {
  return new Promise((ok) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (a) => {
      rl.close();
      ok(/^y(es)?$/i.test(a.trim()));
    });
  });
}

/** Prompts for a secret on a TTY without echoing what is typed. */
export function askSecret(question: string): Promise<string> {
  return new Promise((ok) => {
    let muted = false;
    const out = new Writable({
      write(chunk, _enc, cb) {
        if (!muted) process.stdout.write(chunk);
        cb();
      },
    });
    const rl = createInterface({ input: process.stdin, output: out, terminal: true });
    rl.question(question, (a) => {
      rl.close();
      process.stdout.write('\n');
      ok(a.trim());
    });
    muted = true;
  });
}

/** Reads all of stdin (for `--token -`). */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8');
}
