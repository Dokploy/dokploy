import {
	apiCreateDomain,
	apiUpdateDomain,
} from "@dokploy/server/db/schema/domain";
import { domain, domainCompose } from "@dokploy/server/db/validations/domain";
import { describe, expect, test } from "vitest";

describe("domain validation", () => {
	test("does not require a custom certificate resolver when HTTPS is disabled", () => {
		expect(
			domain.safeParse({
				host: "example.com",
				https: false,
				certificateType: "none",
			}).success,
		).toBe(true);

		expect(
			domainCompose.safeParse({
				host: "example.com",
				https: false,
				certificateType: "none",
				serviceName: "web",
			}).success,
		).toBe(true);
	});

	test("requires a custom certificate resolver for HTTPS custom certificates", () => {
		const result = domain.safeParse({
			host: "example.com",
			https: true,
			certificateType: "custom",
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						path: ["customCertResolver"],
						message: "Required when certificate type is custom",
					}),
				]),
			);
		}
	});

	const baseApplicationDomain = {
		applicationId: "app-1",
		domainType: "application" as const,
		host: "app.example.com",
		path: "/",
		internalPath: "/",
		stripPath: false,
		port: 3000,
		middlewares: [] as string[],
	};

	test("accepts application domain create payloads used by the Caddy modal", () => {
		expect(
			apiCreateDomain.parse({
				...baseApplicationDomain,
				https: true,
				certificateType: "letsencrypt",
			}),
		).toMatchObject({
			applicationId: "app-1",
			domainType: "application",
			https: true,
			certificateType: "letsencrypt",
		});

		expect(
			apiCreateDomain.parse({
				...baseApplicationDomain,
				https: true,
				certificateType: "custom",
				customCertResolver: "local-uploaded-cert-path",
			}),
		).toMatchObject({
			customCertResolver: "local-uploaded-cert-path",
			certificateType: "custom",
		});

		expect(
			apiCreateDomain.parse({
				...baseApplicationDomain,
				https: false,
				certificateType: "none",
			}),
		).toMatchObject({
			https: false,
			certificateType: "none",
		});
	});

	test("accepts application domain update payloads used by the Caddy modal", () => {
		const baseUpdate = {
			...baseApplicationDomain,
			domainId: "domain-1",
		};

		expect(
			apiUpdateDomain.parse({
				...baseUpdate,
				https: true,
				certificateType: "letsencrypt",
			}),
		).toMatchObject({
			domainId: "domain-1",
			domainType: "application",
			https: true,
			certificateType: "letsencrypt",
		});

		expect(
			apiUpdateDomain.parse({
				...baseUpdate,
				https: true,
				certificateType: "custom",
				customCertResolver: "local-uploaded-cert-path",
			}),
		).toMatchObject({
			domainId: "domain-1",
			customCertResolver: "local-uploaded-cert-path",
			certificateType: "custom",
		});

		expect(
			apiUpdateDomain.parse({
				...baseUpdate,
				https: false,
				certificateType: "none",
			}),
		).toMatchObject({
			domainId: "domain-1",
			https: false,
			certificateType: "none",
		});
	});

	test("rejects Caddy custom certificate payloads without an uploaded certificate reference", () => {
		const createResult = apiCreateDomain.safeParse({
			...baseApplicationDomain,
			https: true,
			certificateType: "custom",
		});
		const updateResult = apiUpdateDomain.safeParse({
			...baseApplicationDomain,
			domainId: "domain-1",
			https: true,
			certificateType: "custom",
		});

		for (const result of [createResult, updateResult]) {
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							path: ["customCertResolver"],
							message: "Required when certificate type is custom",
						}),
					]),
				);
			}
		}
	});
});
