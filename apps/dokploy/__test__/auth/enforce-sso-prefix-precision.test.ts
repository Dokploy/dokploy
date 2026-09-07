import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * G5.1 — The `/callback/` prefix matches exactly the better-auth social-OAuth
 * callback endpoint (`/callback/:id`) and nothing else among all endpoints
 * registered by better-auth core and the plugins Dokploy loads
 * (sso, passkey, scim, apiKey, organization, twoFactor, admin).
 *
 * Static cross-check: reads every `createAuthEndpoint("/...")` path string from
 * the installed better-auth / @better-auth/* dist bundles and asserts that
 * `/callback/:id` is the sole path beginning with `/callback/`.
 */

const nodeRequire = createRequire(import.meta.url);

function resolveDist(pkgName: string): string | null {
	try {
		const entry = nodeRequire.resolve(pkgName);
		const dist = path.dirname(entry);
		readdirSync(dist);
		return dist;
	} catch {
		return null;
	}
}

function collectEndpointPaths(distDirs: string[]): string[] {
	const paths = new Set<string>();
	const re = /createAuthEndpoint\("([^"]+)"/g;
	for (const dir of distDirs) {
		const stack = [dir];
		while (stack.length) {
			const cur = stack.pop() as string;
			for (const entry of readdirSync(cur, { withFileTypes: true })) {
				const full = path.join(cur, entry.name);
				if (entry.isDirectory()) stack.push(full);
				else if (entry.name.endsWith(".mjs")) {
					const content = readFileSync(full, "utf8");
					let m: RegExpExecArray | null = re.exec(content);
					while (m !== null) {
						paths.add(m[1]);
						m = re.exec(content);
					}
				}
			}
		}
	}
	return [...paths].sort();
}

describe("G5.1: /callback/ prefix precision", () => {
	it("/callback/:id is the only registered endpoint beginning with /callback/", () => {
		const dirs = [
			resolveDist("better-auth"),
			resolveDist("@better-auth/sso"),
			resolveDist("@better-auth/passkey"),
			resolveDist("@better-auth/api-key"),
			resolveDist("@better-auth/scim"),
		].filter((d): d is string => d !== null);

		expect(dirs.length).toBeGreaterThan(0);
		const allPaths = collectEndpointPaths(dirs);
		expect(allPaths.length).toBeGreaterThan(0);

		const callbackPrefixed = allPaths.filter((p) => p.startsWith("/callback/"));
		expect(callbackPrefixed).toEqual(["/callback/:id"]);
	});
});
