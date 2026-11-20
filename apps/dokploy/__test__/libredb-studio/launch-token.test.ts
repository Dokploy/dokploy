import { createHmac, timingSafeEqual } from "node:crypto";
import {
	createLaunchToken,
	LAUNCH_TOKEN_ISSUER,
	LAUNCH_TOKEN_TTL_SECONDS,
} from "@dokploy/server/utils/libredb-studio/launch-token";
import { afterEach, describe, expect, it, vi } from "vitest";

const SECRET = "0123456789abcdef".repeat(4);
const OTHER_SECRET = "fedcba9876543210".repeat(4);
const NOW = new Date("2026-10-03T12:00:00.900Z");
const NOW_SECONDS = 1791028800;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

const input = {
	secret: SECRET,
	libredbStudioId: "studio-1",
	userId: "user-1",
	email: "owner@example.com",
	role: "admin" as const,
};

const utf8 = (text: string) => Buffer.from(text, "utf8");

const splitToken = (token: string) => {
	const parts = token.split(".");
	expect(parts).toHaveLength(3);
	const [header = "", payload = "", signature = ""] = parts;
	return { header, payload, signature };
};

const decodeSegment = (segment: string) =>
	JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));

const claimsOf = (token: string) => decodeSegment(splitToken(token).payload);

const signatureMatches = (token: string, key: Buffer) => {
	const { header, payload, signature } = splitToken(token);
	const expected = createHmac("sha256", key)
		.update(`${header}.${payload}`)
		.digest();
	const actual = Buffer.from(signature, "base64url");
	return actual.length === expected.length && timingSafeEqual(actual, expected);
};

describe("createLaunchToken", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("exposes the issuer and lifetime constants", () => {
		expect(LAUNCH_TOKEN_ISSUER).toBe("dokploy");
		expect(LAUNCH_TOKEN_TTL_SECONDS).toBe(60);
	});

	it("is a compact JWS of three base64url segments without padding", () => {
		const token = createLaunchToken({ ...input, now: NOW });
		const { header, payload, signature } = splitToken(token);

		expect(header).toMatch(BASE64URL);
		expect(payload).toMatch(BASE64URL);
		expect(signature).toMatch(BASE64URL);
		expect(token).not.toContain("=");
		expect(signature).toHaveLength(43);
	});

	it("uses the HS256 header typed as a LibreDB launch token", () => {
		const { header } = splitToken(createLaunchToken({ ...input, now: NOW }));

		expect(decodeSegment(header)).toStrictEqual({
			alg: "HS256",
			typ: "libredb-launch+jwt",
		});
		expect(Buffer.from(header, "base64url").toString("utf8")).toBe(
			'{"alg":"HS256","typ":"libredb-launch+jwt"}',
		);
	});

	it("signs header and payload with the UTF-8 bytes of the secret", () => {
		const token = createLaunchToken({ ...input, now: NOW });

		expect(signatureMatches(token, utf8(SECRET))).toBe(true);
		expect(signatureMatches(token, Buffer.from(SECRET, "hex"))).toBe(false);
	});

	it("keys the signature with the secret alone, whatever the Studio id", () => {
		const otherStudio = createLaunchToken({
			...input,
			libredbStudioId: "studio-2",
			now: NOW,
		});
		const otherSecret = createLaunchToken({
			...input,
			secret: OTHER_SECRET,
			now: NOW,
		});

		expect(signatureMatches(otherStudio, utf8(SECRET))).toBe(true);
		expect(signatureMatches(otherSecret, utf8(OTHER_SECRET))).toBe(true);
		expect(signatureMatches(otherSecret, utf8(SECRET))).toBe(false);
	});

	it("refuses a secret shorter than 32 characters without quoting it", () => {
		for (const secret of ["", "k".repeat(31)]) {
			expect(() => createLaunchToken({ ...input, secret, now: NOW })).toThrow(
				/^The LibreDB Studio launch secret must be at least 32 characters long$/,
			);
		}
	});

	it("accepts a secret of exactly 32 characters", () => {
		const secret = "k".repeat(32);

		const token = createLaunchToken({ ...input, secret, now: NOW });

		expect(signatureMatches(token, utf8(secret))).toBe(true);
	});

	it("carries the claims Studio verifies", () => {
		const claims = claimsOf(createLaunchToken({ ...input, now: NOW }));

		expect(claims).toEqual({
			iss: "dokploy",
			aud: "studio-1",
			sub: "user-1",
			email: "owner@example.com",
			role: "admin",
			iat: NOW_SECONDS,
			exp: NOW_SECONDS + 60,
			jti: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
		});
		expect(claims).not.toHaveProperty("conn");
	});

	it("adds the conn claim when a connection id is given", () => {
		const claims = claimsOf(
			createLaunchToken({
				...input,
				role: "user",
				connectionId: "dokploy-postgres-1a2b3c4d5e6f",
				now: NOW,
			}),
		);

		expect(claims.role).toBe("user");
		expect(claims.conn).toBe("dokploy-postgres-1a2b3c4d5e6f");
	});

	it("refuses a connection id that Studio would reject", () => {
		for (const connectionId of [
			"",
			"Dokploy-Postgres",
			"seed:abc",
			"a".repeat(65),
		]) {
			expect(() =>
				createLaunchToken({ ...input, connectionId, now: NOW }),
			).toThrow("is not a LibreDB Studio connection id");
		}
	});

	it("expires 60 seconds after it was issued", () => {
		const claims = claimsOf(createLaunchToken({ ...input, now: NOW }));

		expect(claims.exp - claims.iat).toBe(60);
	});

	it("uses a new jti for every token", () => {
		const jtis = new Set(
			Array.from(
				{ length: 50 },
				() => claimsOf(createLaunchToken({ ...input, now: NOW })).jti,
			),
		);

		expect(jtis.size).toBe(50);
	});

	it("uses the current time when now is omitted", () => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);

		const claims = claimsOf(createLaunchToken(input));

		expect(claims.iat).toBe(NOW_SECONDS);
		expect(claims.exp).toBe(NOW_SECONDS + 60);
	});
});
