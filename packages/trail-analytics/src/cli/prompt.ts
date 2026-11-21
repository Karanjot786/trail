import { createInterface } from 'node:readline';

export function ask(question: string): Promise<boolean> {
  return new Promise((ok) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (a) => {
      rl.close();
      ok(/^y(es)?$/i.test(a.trim()));
    });
  });
}
