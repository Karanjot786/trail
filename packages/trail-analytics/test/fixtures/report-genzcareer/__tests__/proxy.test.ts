import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

test('sets the header', async () => {
  const r = await proxy(new NextRequest('https://x.example/'));
  expect(r.headers.get('x-genz')).toBe('1');
});
