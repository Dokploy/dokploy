import {
	createDodomainSchema,
	DODOMAIN_BASE_URL_SECURE_MESSAGE,
	DODOMAIN_DEFAULT_BASE_URL,
	DODOMAIN_SECRET_KEY_PREFIX_MESSAGE,
	DODOMAIN_SECRET_KEY_REQUIRED_MESSAGE,
	dodomainDashboardUrl,
	dodomainSchema,
} from "@/components/dashboard/settings/integrations/dodomain/dodomain-form-schema";
import { apiCreateDoDomain } from "@dokploy/server/db/schema/dodomain";
import { describe, expect, it } from "vitest";

/**
 * The DoDomain connect form validates with this schema (react-hook-form runs
 * it on blur, then on every change). These tests run the real zod schema the
 * form uses, with no mocks, and keep its rules in step with the server's.
 */

const valid = {
	name: "DoDomain",
	secretKey: "dd_sk_test_123",
	appId: "abc123",
	baseUrl: DODOMAIN_DEFAULT_BASE_URL,
};

const messages = (
	result: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } },
	field: string,
) =>
	(result.error?.issues ?? [])
		.filter((issue) => issue.path[0] === field)
		.map((issue) => issue.message);

const create = createDodomainSchema({ editing: false });
const edit = createDodomainSchema({ editing: true });

describe("DoDomain form schema: base URL", () => {
	it("accepts the default https base URL", () => {
		expect(dodomainSchema.safeParse(valid).success).toBe(true);
	});

	it.each([
		"https://app.dodomain.io",
		"https://dodomain.example.com:8443/api",
		"http://localhost:3000",
		"http://127.0.0.1:8080",
		"http://[::1]:8080",
	])("accepts %s", (baseUrl) => {
		expect(create.safeParse({ ...valid, baseUrl }).success).toBe(true);
	});

	it.each([
		"http://app.dodomain.io",
		"http://dodomain.example.com",
		"http://192.168.1.10",
		"http://localhost.evil.example",
	])("rejects the plain http URL %s with the localhost hint", (baseUrl) => {
		const result = create.safeParse({ ...valid, baseUrl });
		expect(result.success).toBe(false);
		expect(messages(result, "baseUrl")).toEqual([
			DODOMAIN_BASE_URL_SECURE_MESSAGE,
		]);
		expect(DODOMAIN_BASE_URL_SECURE_MESSAGE).toBe(
			"Use an https URL (http is only allowed for localhost)",
		);
	});

	it.each(["not a url", "app.dodomain.io", "ftp://app.dodomain.io"])(
		"rejects %s",
		(baseUrl) => {
			const result = create.safeParse({ ...valid, baseUrl });
			expect(result.success).toBe(false);
			expect(messages(result, "baseUrl").length).toBeGreaterThan(0);
		},
	);

	it("uses the same message as the server schema for http base URLs", () => {
		const server = apiCreateDoDomain.safeParse({
			name: "DoDomain",
			secretKey: valid.secretKey,
			appId: valid.appId,
			baseUrl: "http://app.dodomain.io",
		});
		expect(server.success).toBe(false);
		expect(server.error?.issues.map((issue) => issue.message)).toContain(
			DODOMAIN_BASE_URL_SECURE_MESSAGE,
		);
	});
});

describe("DoDomain form schema: secret key when connecting", () => {
	it("requires a key", () => {
		for (const secretKey of ["", "   "]) {
			const result = create.safeParse({ ...valid, secretKey });
			expect(result.success).toBe(false);
			expect(messages(result, "secretKey")).toEqual([
				DODOMAIN_SECRET_KEY_REQUIRED_MESSAGE,
			]);
		}
	});

	it("requires the dd_sk_ prefix with the existing message", () => {
		expect(DODOMAIN_SECRET_KEY_PREFIX_MESSAGE).toBe(
			"DoDomain secret keys start with dd_sk_",
		);
		for (const secretKey of ["sk_live_abc", "dd_pk_abc", "DD_SK_abc", "abc"]) {
			const result = create.safeParse({ ...valid, secretKey });
			expect(result.success, secretKey).toBe(false);
			expect(messages(result, "secretKey")).toEqual([
				DODOMAIN_SECRET_KEY_PREFIX_MESSAGE,
			]);
		}
	});

	it("accepts a prefixed key, ignoring surrounding whitespace", () => {
		expect(
			create.safeParse({ ...valid, secretKey: "  dd_sk_abc  " }).success,
		).toBe(true);
	});
});

describe("DoDomain form schema: secret key when editing", () => {
	it("allows a blank key, which keeps the stored one", () => {
		for (const secretKey of ["", "  "]) {
			expect(edit.safeParse({ ...valid, secretKey }).success).toBe(true);
		}
	});

	it("still checks the prefix of a key that is typed", () => {
		const bad = edit.safeParse({ ...valid, secretKey: "oops" });
		expect(bad.success).toBe(false);
		expect(messages(bad, "secretKey")).toEqual([
			DODOMAIN_SECRET_KEY_PREFIX_MESSAGE,
		]);
		expect(edit.safeParse({ ...valid, secretKey: "dd_sk_new" }).success).toBe(
			true,
		);
	});
});

describe("DoDomain form schema: errors show together", () => {
	it("reports a wrong key and an http base URL in the same pass", () => {
		const result = create.safeParse({
			...valid,
			secretKey: "oops",
			baseUrl: "http://app.dodomain.io",
		});
		expect(result.success).toBe(false);
		expect(messages(result, "secretKey")).toEqual([
			DODOMAIN_SECRET_KEY_PREFIX_MESSAGE,
		]);
		expect(messages(result, "baseUrl")).toEqual([
			DODOMAIN_BASE_URL_SECURE_MESSAGE,
		]);
	});

	it("reports every invalid field when the form is empty", () => {
		const result = create.safeParse({
			name: "",
			secretKey: "",
			appId: "",
			baseUrl: "",
		});
		const fields = new Set(
			(result.error?.issues ?? []).map((issue) => issue.path[0]),
		);
		expect([...fields].sort()).toEqual(["appId", "baseUrl", "name", "secretKey"]);
	});
});

describe("dodomainDashboardUrl", () => {
	it("links the root of the instance the Base URL points at", () => {
		expect(dodomainDashboardUrl("https://dodomain.example.com/api/v1")).toBe(
			"https://dodomain.example.com",
		);
		expect(dodomainDashboardUrl(" http://localhost:3000/x ")).toBe(
			"http://localhost:3000",
		);
	});

	it.each(["", "garbage", "http://app.dodomain.io", "javascript:alert(1)"])(
		"falls back to the default instance for %j",
		(value) => {
			expect(dodomainDashboardUrl(value)).toBe(DODOMAIN_DEFAULT_BASE_URL);
		},
	);
});
