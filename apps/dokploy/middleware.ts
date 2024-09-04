// middleware.ts
import { verifyRequestOrigin } from "lucia";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function middleware(request: NextRequest): Promise<NextResponse> {
	if (request.method === "GET") {
		if (request.nextUrl.locale === "default") {
			const locale = request.cookies.get("geo")?.value || "us";

			return NextResponse.redirect(
				new URL(
					`/${locale}${request.nextUrl.pathname}${request.nextUrl.search}`,
					request.url
				)
			);
		}

		return NextResponse.next();
	}
	const originHeader = request.headers.get("Origin");
	const hostHeader = request.headers.get("Host");

	if (
		!originHeader ||
		!hostHeader ||
		!verifyRequestOrigin(originHeader, [hostHeader])
	) {
		return new NextResponse(null, {
			status: 403,
		});
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		// Don't handle HMR requests for the dev server we rewrite to
		"/settings",
		"/dashboard/(.*)",
		"/invitation",
	],
};
