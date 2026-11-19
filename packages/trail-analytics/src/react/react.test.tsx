import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { Analytics } from './index';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it('injects the script once, even across re-renders', async () => {
  document.head.innerHTML = '';
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root.render(<Analytics site="s" env="prod" />));
  await act(async () => root.render(<Analytics site="s" env="prod" />));
  const s = document.querySelectorAll('script[data-site="s"]');
  expect(s).toHaveLength(1);
  expect((s[0] as HTMLScriptElement).dataset.env).toBe('prod');
});
