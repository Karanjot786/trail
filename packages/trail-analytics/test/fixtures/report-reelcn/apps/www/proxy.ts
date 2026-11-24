import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/docs') return NextResponse.redirect(new URL('/docs/intro', request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ['/docs/:path*'],
};
