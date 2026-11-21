import { NextResponse, type NextRequest } from 'next/server';

export default function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === '/old') return NextResponse.redirect(new URL('/new', req.url));
  return NextResponse.next();
}
