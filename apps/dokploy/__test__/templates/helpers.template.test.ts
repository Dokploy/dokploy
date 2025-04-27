import type { Schema } from "@dokploy/server/templates";
import { processValue } from "@dokploy/server/templates/processors";
import { describe, expect, it } from "vitest";

describe("helpers functions", () => {
	// Mock schema for testing
	const mockSchema: Schema = {
		projectName: "test",
		serverIp: "127.0.0.1",
	};
	// some helpers to test jwt
	type JWTParts = [string, string, string];
	const jwtMatchExp = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
	const jwtBase64Decode = (str: string) => {
		const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
		const padding = "=".repeat((4 - (base64.length % 4)) % 4);
		const decoded = Buffer.from(base64 + padding, "base64").toString("utf-8");
		return JSON.parse(decoded);
	};
	const jwtCheckHeader = (jwtHeader: string) => {
		const decodedHeader = jwtBase64Decode(jwtHeader);
		expect(decodedHeader).toHaveProperty("alg");
		expect(decodedHeader).toHaveProperty("typ");
		expect(decodedHeader.alg).toEqual("HS256");
		expect(decodedHeader.typ).toEqual("JWT");
	};

	describe("${domain}", () => {
		it("should generate a random domain", () => {
			const domain = processValue("${domain}", {}, mockSchema);
			expect(domain.startsWith(`${mockSchema.projectName}-`)).toBeTruthy();
			expect(
				domain.endsWith(
					`${mockSchema.serverIp.replaceAll(".", "-")}.traefik.me`,
				),
			).toBeTruthy();
		});
	});

	describe("${base64}", () => {
		it("should generate a base64 string", () => {
			const base64 = processValue("${base64}", {}, mockSchema);
			expect(base64).toMatch(/^[A-Za-z0-9+=/]+={0,2}$/);
		});
		it.each([
			[4, 8],
			[8, 12],
			[16, 24],
			[32, 44],
			[64, 88],
			[128, 172],
		])(
			"should generate a base64 string from parameter %d bytes length",
			(length, finalLength) => {
				const base64 = processValue(`\${base64:${length}}`, {}, mockSchema);
				expect(base64).toMatch(/^[A-Za-z0-9+=/]+={0,2}$/);
				expect(base64.length).toBe(finalLength);
			},
		);
	});

	describe("${password}", () => {
		it("should generate a password string", () => {
			const password = processValue("${password}", {}, mockSchema);
			expect(password).toMatch(/^[A-Za-z0-9]+$/);
		});
		it.each([6, 8, 12, 16, 32])(
			"should generate a password string respecting parameter %d length",
			(length) => {
				const password = processValue(`\${password:${length}}`, {}, mockSchema);
				expect(password).toMatch(/^[A-Za-z0-9]+$/);
				expect(password.length).toBe(length);
			},
		);
	});

	describe("${hash}", () => {
		it("should generate a hash string", () => {
			const hash = processValue("${hash}", {}, mockSchema);
			expect(hash).toMatch(/^[A-Za-z0-9]+$/);
		});
		it.each([6, 8, 12, 16, 32])(
			"should generate a hash string respecting parameter %d length",
			(length) => {
				const hash = processValue(`\${hash:${length}}`, {}, mockSchema);
				expect(hash).toMatch(/^[A-Za-z0-9]+$/);
				expect(hash.length).toBe(length);
			},
		);
	});

	describe("${uuid}", () => {
		it("should generate a UUID string", () => {
			const uuid = processValue("${uuid}", {}, mockSchema);
			expect(uuid).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
			);
		});
	});

	describe("${timestamp}", () => {
		it("should generate a timestamp string in milliseconds", () => {
			const timestamp = processValue("${timestamp}", {}, mockSchema);
			const nowLength = Math.floor(Date.now()).toString().length;
			expect(timestamp).toMatch(/^\d+$/);
			expect(timestamp.length).toBe(nowLength);
		});
	});
	describe("${timestampms}", () => {
		it("should generate a timestamp string in milliseconds", () => {
			const timestamp = processValue("${timestampms}", {}, mockSchema);
			const nowLength = Date.now().toString().length;
			expect(timestamp).toMatch(/^\d+$/);
			expect(timestamp.length).toBe(nowLength);
		});
		it("should generate a timestamp string in milliseconds from parameter", () => {
			const timestamp = processValue(
				"${timestampms:2025-01-01}",
				{},
				mockSchema,
			);
			expect(timestamp).toEqual("1735689600000");
		});
	});
	describe("${timestamps}", () => {
		it("should generate a timestamp string in seconds", () => {
			const timestamps = processValue("${timestamps}", {}, mockSchema);
			const nowLength = Math.floor(Date.now() / 1000).toString().length;
			expect(timestamps).toMatch(/^\d+$/);
			expect(timestamps.length).toBe(nowLength);
		});
		it("should generate a timestamp string in seconds from parameter", () => {
			const timestamps = processValue(
				"${timestamps:2025-01-01}",
				{},
				mockSchema,
			);
			expect(timestamps).toEqual("1735689600");
		});
	});

	describe("${randomPort}", () => {
		it("should generate a random port string", () => {
			const randomPort = processValue("${randomPort}", {}, mockSchema);
			expect(randomPort).toMatch(/^\d+$/);
			expect(Number(randomPort)).toBeLessThan(65536);
		});
	});

	describe("${username}", () => {
		it("should generate a username string", () => {
			const username = processValue("${username}", {}, mockSchema);
			expect(username).toMatch(/^[a-zA-Z0-9._-]{3,}$/);
		});
	});

	describe("${email}", () => {
		it("should generate an email string", () => {
			const email = processValue("${email}", {}, mockSchema);
			expect(email).toMatch(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/);
		});
	});

	describe("${jwt}", () => {
		it("should generate a JWT string", () => {
			const jwt = processValue("${jwt}", {}, mockSchema);
			expect(jwt).toMatch(jwtMatchExp);
			const parts = jwt.split(".") as JWTParts;
			const decodedPayload = jwtBase64Decode(parts[1]);
			jwtCheckHeader(parts[0]);
			expect(decodedPayload).toHaveProperty("iat");
			expect(decodedPayload).toHaveProperty("iss");
			expect(decodedPayload).toHaveProperty("exp");
			expect(decodedPayload.iss).toEqual("dokploy");
		});
		it.each([6, 8, 12, 16, 32])(
			"should generate a random hex string from parameter %d byte length",
			(length) => {
				const jwt = processValue(`\${jwt:${length}}`, {}, mockSchema);
				expect(jwt).toMatch(/^[A-Za-z0-9-_.]+$/);
				expect(jwt.length).toBeGreaterThanOrEqual(length); // bytes translated to hex can take up to 2x the length
				expect(jwt.length).toBeLessThanOrEqual(length * 2);
			},
		);
	});
	describe("${jwt:secret}", () => {
		it("should generate a JWT string respecting parameter secret from variable", () => {
			const jwt = processValue(
				"${jwt:secret}",
				{ secret: "mysecret" },
				mockSchema,
			);
			expect(jwt).toMatch(jwtMatchExp);
			const parts = jwt.split(".") as JWTParts;
			const decodedPayload = jwtBase64Decode(parts[1]);
			jwtCheckHeader(parts[0]);
			expect(decodedPayload).toHaveProperty("iat");
			expect(decodedPayload).toHaveProperty("iss");
			expect(decodedPayload).toHaveProperty("exp");
			expect(decodedPayload.iss).toEqual("dokploy");
		});
	});
	describe("${jwt:secret:payload}", () => {
		it("should generate a JWT string respecting parameters secret and payload from variables", () => {
			const iat = Math.floor(new Date("2025-01-01T00:00:00Z").getTime() / 1000);
			const expiry = iat + 3600;
			const jwt = processValue(
				"${jwt:secret:payload}",
				{
					secret: "mysecret",
					payload: `{"iss": "test-issuer", "iat": ${iat}, "exp": ${expiry}, "customprop": "customvalue"}`,
				},
				mockSchema,
			);
			expect(jwt).toMatch(jwtMatchExp);
			const parts = jwt.split(".") as JWTParts;
			jwtCheckHeader(parts[0]);
			const decodedPayload = jwtBase64Decode(parts[1]);
			expect(decodedPayload).toHaveProperty("iat");
			expect(decodedPayload.iat).toEqual(iat);
			expect(decodedPayload).toHaveProperty("iss");
			expect(decodedPayload.iss).toEqual("test-issuer");
			expect(decodedPayload).toHaveProperty("exp");
			expect(decodedPayload.exp).toEqual(expiry);
			expect(decodedPayload).toHaveProperty("customprop");
			expect(decodedPayload.customprop).toEqual("customvalue");
			expect(jwt).toEqual(
				"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3MzU2ODk2MDAsImV4cCI6MTczNTY5MzIwMCwiaXNzIjoidGVzdC1pc3N1ZXIiLCJjdXN0b21wcm9wIjoiY3VzdG9tdmFsdWUifQ.m42U7PZSUSCf7gBOJrxJir0rQmyPq4rA59Dydr_QahI",
			);
		});
	});
});
