import type { Domain } from "@dokploy/server";
import { createDomainLabels } from "@dokploy/server";
import { parse, stringify } from "yaml";
import { describe, expect, it } from "vitest";

/**
 * Regression tests for Traefik Host rule label format.
 *
 * These tests verify that the Host rule is generated with the correct format:
 * - Host(`domain.com`) - with opening and closing parentheses
 * - Host(`domain.com`) && PathPrefix(`/path`) - for path-based routing
 *
 * Issue: https://github.com/Dokploy/dokploy/issues/3161
 * The bug caused Host rules to be malformed as Host`domain.com`)
 * (missing opening parenthesis) which broke all domain routing.
 */
describe("Host rule format regression tests", () => {
	const baseDomain: Domain = {
		host: "example.com",
		port: 8080,
		https: false,
		uniqueConfigKey: 1,
		customCertResolver: null,
		certificateType: "none",
		applicationId: "",
		composeId: "",
		domainType: "compose",
		serviceName: "test-app",
		domainId: "",
		path: "/",
		createdAt: "",
		previewDeploymentId: "",
		internalPath: "/",
		stripPath: false,
	};

	describe("Host rule format validation", () => {
		it("should generate Host rule with correct parentheses format", async () => {
			const labels = await createDomainLabels("test-app", baseDomain, "web");
			const ruleLabel = labels.find((l) => l.includes(".rule="));

			expect(ruleLabel).toBeDefined();
			// Verify exact format: Host(`domain`)
			expect(ruleLabel).toMatch(/Host\(`[^`]+`\)/);
			// Ensure opening parenthesis is present after Host
			expect(ruleLabel).toContain("Host(`example.com`)");
			// Ensure it does NOT have the malformed format
			expect(ruleLabel).not.toMatch(/Host`[^`]+`\)/);
		});

		it("should generate PathPrefix with correct parentheses format", async () => {
			const labels = await createDomainLabels(
				"test-app",
				{ ...baseDomain, path: "/api" },
				"web",
			);
			const ruleLabel = labels.find((l) => l.includes(".rule="));

			expect(ruleLabel).toBeDefined();
			// Verify PathPrefix format
			expect(ruleLabel).toMatch(/PathPrefix\(`[^`]+`\)/);
			expect(ruleLabel).toContain("PathPrefix(`/api`)");
			// Ensure opening parenthesis is present
			expect(ruleLabel).not.toMatch(/PathPrefix`[^`]+`\)/);
		});

		it("should generate combined Host and PathPrefix with correct format", async () => {
			const labels = await createDomainLabels(
				"test-app",
				{ ...baseDomain, path: "/api/v1" },
				"websecure",
			);
			const ruleLabel = labels.find((l) => l.includes(".rule="));

			expect(ruleLabel).toBeDefined();
			expect(ruleLabel).toBe(
				"traefik.http.routers.test-app-1-websecure.rule=Host(`example.com`) && PathPrefix(`/api/v1`)",
			);
		});
	});

	describe("YAML serialization preserves Host rule format", () => {
		it("should preserve Host rule format through YAML stringify/parse", async () => {
			const labels = await createDomainLabels("test-app", baseDomain, "web");
			const ruleLabel = labels.find((l) => l.includes(".rule="));

			// Simulate compose file structure
			const composeSpec = {
				services: {
					myapp: {
						image: "nginx",
						labels: labels,
					},
				},
			};

			// Stringify to YAML
			const yamlOutput = stringify(composeSpec, { lineWidth: 1000 });

			// Parse back
			const parsed = parse(yamlOutput) as typeof composeSpec;
			const parsedRuleLabel = parsed.services.myapp.labels.find((l: string) =>
				l.includes(".rule="),
			);

			// Verify format is preserved
			expect(parsedRuleLabel).toBe(ruleLabel);
			expect(parsedRuleLabel).toContain("Host(`example.com`)");
			expect(parsedRuleLabel).not.toMatch(/Host`[^`]+`\)/);
		});

		it("should preserve complex rule format through YAML serialization", async () => {
			const labels = await createDomainLabels(
				"test-app",
				{ ...baseDomain, path: "/api", https: true },
				"websecure",
			);

			const composeSpec = {
				services: {
					myapp: {
						labels: labels,
					},
				},
			};

			const yamlOutput = stringify(composeSpec, { lineWidth: 1000 });
			const parsed = parse(yamlOutput) as typeof composeSpec;
			const parsedRuleLabel = parsed.services.myapp.labels.find((l: string) =>
				l.includes(".rule="),
			);

			expect(parsedRuleLabel).toContain(
				"Host(`example.com`) && PathPrefix(`/api`)",
			);
		});
	});

	describe("Edge cases for domain names", () => {
		const domainCases = [
			{ name: "simple domain", host: "example.com" },
			{ name: "subdomain", host: "app.example.com" },
			{ name: "deep subdomain", host: "api.v1.app.example.com" },
			{ name: "numeric domain", host: "123.example.com" },
			{ name: "hyphenated domain", host: "my-app.example-host.com" },
			{ name: "localhost", host: "localhost" },
			{ name: "IP address style", host: "192.168.1.100" },
		];

		for (const { name, host } of domainCases) {
			it(`should generate correct Host rule for ${name}: ${host}`, async () => {
				const labels = await createDomainLabels(
					"test-app",
					{ ...baseDomain, host },
					"web",
				);
				const ruleLabel = labels.find((l) => l.includes(".rule="));

				expect(ruleLabel).toBeDefined();
				expect(ruleLabel).toContain(`Host(\`${host}\`)`);
				// Verify parenthesis is present
				expect(ruleLabel).toMatch(
					new RegExp(`Host\\(\\\`${host.replace(/\./g, "\\.")}\\\`\\)`),
				);
			});
		}
	});

	describe("Multiple domains scenario", () => {
		it("should generate correct format for both web and websecure entrypoints", async () => {
			const webLabels = await createDomainLabels("test-app", baseDomain, "web");
			const websecureLabels = await createDomainLabels(
				"test-app",
				baseDomain,
				"websecure",
			);

			const webRule = webLabels.find((l) => l.includes(".rule="));
			const websecureRule = websecureLabels.find((l) => l.includes(".rule="));

			// Both should have correct format
			expect(webRule).toContain("Host(`example.com`)");
			expect(websecureRule).toContain("Host(`example.com`)");

			// Neither should have malformed format
			expect(webRule).not.toMatch(/Host`[^`]+`\)/);
			expect(websecureRule).not.toMatch(/Host`[^`]+`\)/);
		});
	});

	describe("Special characters in paths", () => {
		const pathCases = [
			{ name: "simple path", path: "/api" },
			{ name: "nested path", path: "/api/v1/users" },
			{ name: "path with hyphen", path: "/api-v1" },
			{ name: "path with underscore", path: "/api_v1" },
		];

		for (const { name, path } of pathCases) {
			it(`should generate correct PathPrefix for ${name}: ${path}`, async () => {
				const labels = await createDomainLabels(
					"test-app",
					{ ...baseDomain, path },
					"web",
				);
				const ruleLabel = labels.find((l) => l.includes(".rule="));

				expect(ruleLabel).toBeDefined();
				expect(ruleLabel).toContain(`PathPrefix(\`${path}\`)`);
				// Verify parenthesis is present
				expect(ruleLabel).not.toMatch(/PathPrefix`[^`]+`\)/);
			});
		}
	});
});
