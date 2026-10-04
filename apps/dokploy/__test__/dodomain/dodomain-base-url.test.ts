import {
	apiCreateDoDomain,
	apiTestDoDomainConnection,
	apiUpdateDoDomain,
	DODOMAIN_DEFAULT_BASE_URL,
} from "@dokploy/server/db/schema/dodomain";
import { describe, expect, it } from "vitest";

/**
 * The DoDomain secret key (`dd_sk_`) is sent as a bearer token to the base
 * URL, so plain http would leak it. Only https is accepted, except for
 * loopback hosts used in local development.
 */

const MESSAGE = "Use an https URL (http is only allowed for localhost)";

const create = (baseUrl?: string) =>
	apiCreateDoDomain.safeParse({
		name: "DoDomain",
		secretKey: "dd_sk_test",
		appId: "app_1",
		...(baseUrl === undefined ? {} : { baseUrl }),
	});

describe("DoDomain base URL validation", () => {
	it("defaults to the https DoDomain host", () => {
		const parsed = create();
		expect(parsed.success).toBe(true);
		expect(parsed.data?.baseUrl).toBe(DODOMAIN_DEFAULT_BASE_URL);
	});

	it.each([
		"https://app.dodomain.io",
		"https://dodomain.example.com:8443/api",
		"HTTPS://App.DoDomain.io",
	])("accepts the https URL %s", (url) => {
		expect(create(url).success).toBe(true);
	});

	it.each([
		"http://example.com",
		"http://app.dodomain.io",
		"http://10.0.0.5:3000",
		"http://localhost.evil.com",
		"http://localhost@evil.com",
		"http://127.0.0.1.evil.com",
		"http://evil.com/localhost",
		"http://evil.com?next=http://localhost",
	])("rejects the plain http URL %s", (url) => {
		const parsed = create(url);
		expect(parsed.success).toBe(false);
		expect(parsed.error?.issues.map((issue) => issue.message)).toContain(
			MESSAGE,
		);
	});

	it.each([
		"http://localhost",
		"http://localhost:3000",
		"http://127.0.0.1",
		"http://127.0.0.1:8080",
		"http://[::1]",
		"http://[::1]:3000",
	])("accepts the loopback http URL %s", (url) => {
		expect(create(url).success).toBe(true);
	});

	it.each(["ftp://example.com", "javascript:alert(1)", "not a url", ""])(
		"rejects the non-http(s) value %j",
		(url) => {
			expect(create(url).success).toBe(false);
		},
	);

	it("strips trailing slashes", () => {
		expect(create("https://app.dodomain.io/").data?.baseUrl).toBe(
			"https://app.dodomain.io",
		);
		expect(create("https://app.dodomain.io///").data?.baseUrl).toBe(
			"https://app.dodomain.io",
		);
		expect(create("http://localhost:3000/").data?.baseUrl).toBe(
			"http://localhost:3000",
		);
	});

	it("trims surrounding whitespace", () => {
		expect(create("  https://app.dodomain.io/  ").data?.baseUrl).toBe(
			"https://app.dodomain.io",
		);
	});

	it("applies the same rule to update and test-connection inputs", () => {
		expect(apiUpdateDoDomain.safeParse({ baseUrl: "http://example.com" }).success).toBe(
			false,
		);
		expect(
			apiUpdateDoDomain.safeParse({ baseUrl: "https://example.com/" }).data
				?.baseUrl,
		).toBe("https://example.com");
		expect(apiUpdateDoDomain.safeParse({}).success).toBe(true);

		expect(
			apiTestDoDomainConnection.safeParse({ baseUrl: "http://example.com" })
				.success,
		).toBe(false);
		expect(
			apiTestDoDomainConnection.safeParse({ baseUrl: "http://localhost:3000" })
				.success,
		).toBe(true);
		expect(apiTestDoDomainConnection.safeParse({}).data?.baseUrl).toBe(
			DODOMAIN_DEFAULT_BASE_URL,
		);
	});
});
