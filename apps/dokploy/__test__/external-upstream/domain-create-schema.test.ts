import { apiCreateDomain } from "@dokploy/server/db/schema";
import { describe, expect, it } from "vitest";

const domain = {
	host: "service.example.com",
	customCertResolver: "",
};

describe("external upstream domain creation input", () => {
	it("rejects an external upstream ID when domainType is omitted", () => {
		const result = apiCreateDomain.safeParse({
			...domain,
			externalUpstreamId: "upstream-1",
		});

		expect(result.success).toBe(false);
	});

	it("rejects mismatched service IDs", () => {
		const result = apiCreateDomain.safeParse({
			...domain,
			domainType: "externalUpstream",
			externalUpstreamId: "upstream-1",
			applicationId: "application-1",
		});

		expect(result.success).toBe(false);
	});

	it("requires an external upstream ID for external upstream domains", () => {
		const result = apiCreateDomain.safeParse({
			...domain,
			domainType: "externalUpstream",
		});

		expect(result.success).toBe(false);
	});

	it("keeps the optional domainType for existing application callers", () => {
		const result = apiCreateDomain.safeParse({
			...domain,
			applicationId: "application-1",
		});

		expect(result.success).toBe(true);
	});

	it("rejects a mismatched application domain type", () => {
		const result = apiCreateDomain.safeParse({
			...domain,
			domainType: "compose",
			applicationId: "application-1",
		});

		expect(result.success).toBe(false);
	});

	it("requires a type for non-application service associations", () => {
		const result = apiCreateDomain.safeParse({
			...domain,
			composeId: "compose-1",
		});

		expect(result.success).toBe(false);
	});

	it("accepts an explicitly associated preview domain", () => {
		const result = apiCreateDomain.safeParse({
			...domain,
			domainType: "preview",
			previewDeploymentId: "preview-1",
		});

		expect(result.success).toBe(true);
	});
});
