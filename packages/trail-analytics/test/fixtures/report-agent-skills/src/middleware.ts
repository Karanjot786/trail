import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { isSeoBot } from './lib/bots';

const intl = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  if (isSeoBot(request)) return new NextResponse(null, { status: 429 });
  return intl(request);
}

export const config = { matcher: ['/((?!api|_next|.*\\..*).*)'] };
