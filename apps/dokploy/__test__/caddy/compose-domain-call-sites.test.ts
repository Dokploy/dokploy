import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const readSource = (relativePath: string) =>
	readFileSync(new URL(relativePath, import.meta.url), "utf8");

const expectNoRawComposeCreateDomain = (source: string) => {
	expect(source).not.toMatch(
		/createDomain\(\s*\{[\s\S]{0,500}domainType:\s*"compose"/,
	);
};

describe("compose domain creation call-site contract", () => {
	test("routes template compose domains through shared provider-aware helpers", () => {
		const source = readSource("../../server/api/routers/compose.ts");

		expect(source).toContain("createComposeDomain(");
		expect(source).toContain("removeComposeDomainsForWebServer(");
		expect(source).toContain("ctx.session.activeOrganizationId");
		expectNoRawComposeCreateDomain(source);
	});

	test("routes AI-generated compose domains through shared provider-aware helpers", () => {
		const source = readSource("../../server/api/routers/ai.ts");

		expect(source).toContain("createComposeDomain(");
		expect(source).toContain("ctx.session.activeOrganizationId");
		expectNoRawComposeCreateDomain(source);
	});

	test("routes project duplication domains through application and compose helpers", () => {
		const source = readSource("../../server/api/routers/project.ts");

		expect(source).toContain("await createDomain({");
		expect(source).toContain("applicationId: newApplication.applicationId");
		expect(source).toContain("createComposeDomain(");
		expect(source).toContain("ctx.session.activeOrganizationId");
		expectNoRawComposeCreateDomain(source);
	});

	test("routes domain-router compose domains through shared provider-aware helpers", () => {
		const source = readSource("../../server/api/routers/domain.ts");

		expect(source).toContain("createComposeDomain(");
		expect(source).toContain("refreshCaddyComposeRoutes(");
		expect(source).toContain("ctx.session.activeOrganizationId");
		expectNoRawComposeCreateDomain(source);
	});

	test("keeps compose deploy route refreshes tied to eagerly loaded project org context", () => {
		const source = readSource(
			"../../../../packages/server/src/services/compose.ts",
		);

		expect(source).toMatch(
			/export const findComposeById[\s\S]*environment:\s*{\s*with:\s*{\s*project:\s*true/,
		);

		const routeRefreshCalls =
			source.match(/writeCaddyComposeRoutesForTargets\([\s\S]*?\);/g) ?? [];
		expect(routeRefreshCalls).toHaveLength(2);
		for (const call of routeRefreshCalls) {
			expect(call).toContain(
				"organizationId: compose.environment.project.organizationId",
			);
		}
	});
});
