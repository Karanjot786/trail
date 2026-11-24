import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const res = NextResponse.next();
  res.headers.set('x-genz', '1');
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:js|css|png)$).*)'],
};
