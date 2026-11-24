import { describe, expectTypeOf, it } from 'vitest';
import { withTrail } from './proxy';

class NextRequest extends Request { nextUrl!: URL; cookies!: Map<string, string> }
class NextResponse extends Response {
  cookies!: Map<string, string>;
  static next(): NextResponse { return new NextResponse(); }
}
class NextFetchEvent { waitUntil(_p: Promise<unknown>) {} sourcePage = ''; }

describe('withTrail types', () => {
  it('keeps a sync handler return type (agent-skills)', () => {
    const p = withTrail((_r: NextRequest) => new NextResponse());
    expectTypeOf(p).toBeCallableWith(new NextRequest('https://x'));
    expectTypeOf(p(new NextRequest('https://x'))).toEqualTypeOf<NextResponse>();
  });
  it('keeps an async named handler (genzcareer)', async () => {
    const proxy = withTrail(async (_r: NextRequest) => new NextResponse());
    expectTypeOf(proxy).toBeCallableWith(new NextRequest('https://x'));
    expectTypeOf(await proxy(new NextRequest('https://x'))).toEqualTypeOf<NextResponse>();
  });
  it('accepts a Clerk-style handler with a NextFetchEvent', () => {
    const p = withTrail((_r: NextRequest, _e: NextFetchEvent) => undefined);
    expectTypeOf(p).toBeCallableWith(new NextRequest('https://x'), new NextFetchEvent());
  });
  it('accepts reelcn style NextResponse.next()', () => {
    const p = withTrail((_request: NextRequest) => NextResponse.next());
    expectTypeOf(p).toBeCallableWith(new NextRequest('https://x'));
  });
});
