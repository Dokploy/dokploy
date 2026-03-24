import type { Schema } from "@dokploy/server/templates";
import type { CompleteTemplate } from "@dokploy/server/templates/processors";
import { processTemplate } from "@dokploy/server/templates/processors";
import { describe, expect, it } from "vitest";

describe("processTemplate", () => {
	// Mock schema for testing
	const mockSchema: Schema = {
		projectName: "test",
		serverIp: "127.0.0.1",
	};

	describe("variables processing", () => {
		it("should process basic variables with utility functions", () => {
			const template: CompleteTemplate = {
				metadata: {} as any,
				variables: {
					main_domain: "${domain}",
					secret_base: "${base64:64}",
					totp_key: "${base64:32}",
					password: "${password:32}",
					hash: "${hash:16}",
				},
				config: {
					domains: [],
					env: {},
				},
			};

			const result = processTemplate(template, mockSchema);
			expect(result.envs).toHaveLength(0);
			expect(result.domains).toHaveLength(0);
			expect(result.mounts).toHaveLength(0);
		});

		it("should allow referencing variables in other variables", () => {
			const template: CompleteTemplate = {
				metadata: {} as any,
				variables: {
					main_domain: "${domain}",
					api_domain: "api.${main_domain}",
				},
				config: {
					domains: [],
					env: {},
				},
			};

			const result = processTemplate(template, mockSchema);
			expect(result.envs).toHaveLength(0);
			expect(result.domains).toHaveLength(0);
			expect(result.mounts).toHaveLength(0);
		});

		it("should allow creation of real jwt secret", () => {
			const template: CompleteTemplate = {
				metadata: {} as any,
				variables: {
					jwt_secret: "cQsdycq1hDLopQonF6jUTqgQc5WEZTwWLL02J6XJ",
					anon_payload: JSON.stringify({
						role: "tester",
						iss: "dockploy",
						iat: "${timestamps:2025-01-01T00:00:00Z}",
						exp: "${timestamps:2030-01-01T00:00:00Z}",
					}),
					anon_key: "${jwt:jwt_secret:anon_payload}",
				},
				config: {
					domains: [],
					env: {
						ANON_KEY: "${anon_key}",
					},
				},
			};
			const result = processTemplate(template, mockSchema);
			expect(result.envs).toHaveLength(1);
			expect(result.envs).toContain(
				"ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOiIxNzM1Njg5NjAwIiwiZXhwIjoiMTg5MzQ1NjAwMCIsInJvbGUiOiJ0ZXN0ZXIiLCJpc3MiOiJkb2NrcGxveSJ9.BG5JoxL2_NaTFbPgyZdm3kRWenf_O3su_HIRKGCJ_kY",
			);
			expect(result.mounts).toHaveLength(0);
			expect(result.domains).toHaveLength(0);
		});
	});

	describe("domains processing", () => {
		it("should process domains with explicit host", () => {
			const template: CompleteTemplate = {
				metadata: {} as any,
				variables: {
					main_domain: "${domain}",
				},
				config: {
					domains: [
						{
							serviceName: "plausible",
							port: 8000,
							host: "${main_domain}",
						},
					],
					env: {},
				},
			};

			const result = processTemplate(template, mockSchema);
			expect(result.domains).toHaveLength(1);
			const domain = result.domains[0];
			expect(domain).toBeDefined();
			if (!domain) return;
			expect(domain).toMatchObject({
				serviceName: "plausible",
				port: 8000,
			});
			expect(domain.host).toBeDefined();
			expect(domain.host).toContain(mockSchema.projectName);
		});

		it("should generate random domain if host is not specified", () => {
			const template: CompleteTemplate = {
				metadata: {} as any,
				variables: {},
				config: {
					domains: [
						{
							serviceName: "plausible",
							port: 8000,
						},
					],
					env: {},
				},
			};

			const result = processTemplate(template, mockSchema);
			expect(result.domains).toHaveLength(1);
			const domain = result.domains[0];
			expect(domain).toBeDefined();
			if (!domain || !domain.host) return;
			expect(domain.host).toBeDefined();
			expect(domain.host).toContain(mockSchema.projectName);
		});

		it("should allow using ${domain} directly in host", () => {
			const template: CompleteTemplate = {
				metadata: {} as any,
				variables: {},
				config: {
					domains: [
						{
							serviceName: "plausible",
							port: 8000,
							host: "${domain}",
						},
					],
					env: {},
				},
			};

			const result = processTemplate(template, mockSchema);
			expect(result.domains).toHaveLength(1);
			const domain = result.domains[0];
			expect(domain).toBeDefined();
			if (!domain || !domain.host) return;
			expect(domain.host).toBeDefined();
			expect(domain.host).toContain(mockSchema.projectName);
		});
	});

	describe("environment variables processing", () => {
		it("should process env vars with variable references", () => {
			const template: CompleteTemplate = {
				metadata: {} as any,
				variables: {
					main_domain: "${domain}",
					secret_base: "${base64:64}",
				},
				config: {
					domains: [],
					env: {
						BASE_URL: "http://${main_domain}",
						SECRET_KEY_BASE: "${secret_base}",
					},
				},
			};

			const result = processTemplate(template, mockSchema);
			expect(result.envs).toHaveLength(2);
			const baseUrl = result.envs.find((env: string) =>
				env.startsWith("BASE_URL="),
			);
			const secretKey = result.envs.find((env: string) =>
				env.startsWith("SECRET_KEY_BASE="),
			);

			expect(baseUrl).toBeDefined();
			expect(secretKey).toBeDefined();
			if (!baseUrl || !secretKey) return;

			expect(baseUrl).toContain(mockSchema.projectName);
			const base64Value = secretKey.split("=")[1];
			expect(base64Value).toBeDefined();
			if (!base64Value) return;
			expect(base64Value).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
			expect(base64Value.length).toBeGreaterThanOrEqual(86);
			expect(base64Value.length).toBeLessThanOrEqual(88);
		});

		it("should process env vars when provided as an array", () => {
			const template: CompleteTemplate = {
				metadata: {} as any,
				variables: {},
				config: {
					domains: [],
					env: [
						'CLOUDFLARE_TUNNEL_TOKEN="<INSERT TOKEN>"',
						'ANOTHER_VAR="some value"',
						"DOMAIN=${domain}",
					],
					mounts: [],
				},
			};

			const result = processTemplate(template, mockSchema);
			expect(result.envs).toHaveLength(3);

			// Should preserve exact format for static values
			expect(result.envs[0]).toBe('CLOUDFLARE_TUNNEL_TOKEN="<INSERT TOKEN>"');
			expect(result.envs[1]).toBe('ANOTHER_VAR="some value"');

			// Should process variables in array items
			expect(result.envs[2]).toContain(mockSchema.projectName);
		});

		it("should allow using utility functions directly in env vars", () => {
			const template: CompleteTemplate = {
				metadata: {} as any,
				variables: {},
				config: {
					domains: [],
					env: {
						RANDOM_DOMAIN: "${domain}",
						SECRET_KEY: "${base64:32}",
					},
				},
			};

			const result = processTemplate(template, mockSchema);
			expect(result.envs).toHaveLength(2);
			const randomDomainEnv = result.envs.find((env: string) =>
				env.startsWith("RANDOM_DOMAIN="),
			);
			const secretKeyEnv = result.envs.find((env: string) =>
				env.startsWith("SECRET_KEY="),
			);
			expect(randomDomainEnv).toBeDefined();
			expect(secretKeyEnv).toBeDefined();
			if (!randomDomainEnv || !secretKeyEnv) return;

			expect(randomDomainEnv).toContain(mockSchema.projectName);
			const base64Value = secretKeyEnv.split("=")[1];
			expect(base64Value).toBeDefined();
			if (!base64Value) return;
			expect(base64Value).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
			expect(base64Value.length).toBeGreaterThanOrEqual(42);
			expect(base64Value.length).toBeLessThanOrEqual(44);
		});

		it("should handle boolean values in env vars when provided as an array", () => {
			const template: CompleteTemplate = {
				metadata: {} as any,
				variables: {},
				config: {
					domains: [],
					env: [
						"ENABLE_USER_SIGN_UP=false",
						"DEBUG_MODE=true",
						"SOME_NUMBER=42",
					],
					mounts: [],
				},
			};

			const result = processTemplate(template, mockSchema);
			expect(result.envs).toHaveLength(3);
			expect(result.envs).toContain("ENABLE_USER_SIGN_UP=false");
			expect(result.envs).toContain("DEBUG_MODE=true");
			expect(result.envs).toContain("SOME_NUMBER=42");
		});

		it("should handle boolean values in env vars when provided as an object", () => {
			const template: CompleteTemplate = {
				metadata: {} as any,
				variables: {},
				config: {
					domains: [],
					env: {
						ENABLE_USER_SIGN_UP: false,
						DEBUG_MODE: true,
						SOME_NUMBER: 42,
					},
				},
			};

			const result = processTemplate(template, mockSchema);
			expect(result.envs).toHaveLength(3);
			expect(result.envs).toContain("ENABLE_USER_SIGN_UP=false");
			expect(result.envs).toContain("DEBUG_MODE=true");
			expect(result.envs).toContain("SOME_NUMBER=42");
		});
	});

	describe("mounts processing", () => {
		it("should process mounts with variable references", () => {
			const template: CompleteTemplate = {
				metadata: {} as any,
				variables: {
					config_path: "/etc/config",
					secret_key: "${base64:32}",
				},
				config: {
					domains: [],
					env: {},
					mounts: [
						{
							filePath: "${config_path}/config.xml",
							content: "secret_key=${secret_key}",
						},
					],
				},
			};

			const result = processTemplate(template, mockSchema);
			expect(result.mounts).toHaveLength(1);
			const mount = result.mounts[0];
			expect(mount).toBeDefined();
			if (!mount) return;
			expect(mount.filePath).toContain("/etc/config");
			expect(mount.content).toMatch(/secret_key=[A-Za-z0-9+/]{32}/);
		});

		it("should allow using utility functions directly in mount content", () => {
			const template: CompleteTemplate = {
				metadata: {} as any,
				variables: {},
				config: {
					domains: [],
					env: {},
					mounts: [
						{
							filePath: "/config/secrets.txt",
							content: "random_domain=${domain}\nsecret=${base64:32}",
						},
					],
				},
			};

			const result = processTemplate(template, mockSchema);
			expect(result.mounts).toHaveLength(1);
			const mount = result.mounts[0];
			expect(mount).toBeDefined();
			if (!mount) return;
			expect(mount.content).toContain(mockSchema.projectName);
			expect(mount.content).toMatch(/secret=[A-Za-z0-9+/]{32}/);
		});
	});

	describe("complex template processing", () => {
		it("should process a complete template with all features", () => {
			const template: CompleteTemplate = {
				metadata: {} as any,
				variables: {
					main_domain: "${domain}",
					secret_base: "${base64:64}",
					totp_key: "${base64:32}",
				},
				config: {
					domains: [
						{
							serviceName: "plausible",
							port: 8000,
							host: "${main_domain}",
						},
						{
							serviceName: "api",
							port: 3000,
							host: "api.${main_domain}",
						},
					],
					env: {
						BASE_URL: "http://${main_domain}",
						SECRET_KEY_BASE: "${secret_base}",
						TOTP_VAULT_KEY: "${totp_key}",
					},
					mounts: [
						{
							filePath: "/config/app.conf",
							content: `
                domain=\${main_domain}
                secret=\${secret_base}
                totp=\${totp_key}
              `,
						},
					],
				},
			};

			const result = processTemplate(template, mockSchema);

			// Check domains
			expect(result.domains).toHaveLength(2);
			const [domain1, domain2] = result.domains;
			expect(domain1).toBeDefined();
			expect(domain2).toBeDefined();
			if (!domain1 || !domain2) return;
			expect(domain1.host).toBeDefined();
			expect(domain1.host).toContain(mockSchema.projectName);
			expect(domain2.host).toContain("api.");
			expect(domain2.host).toContain(mockSchema.projectName);

			// Check env vars
			expect(result.envs).toHaveLength(3);
			const baseUrl = result.envs.find((env: string) =>
				env.startsWith("BASE_URL="),
			);
			const secretKey = result.envs.find((env: string) =>
				env.startsWith("SECRET_KEY_BASE="),
			);
			const totpKey = result.envs.find((env: string) =>
				env.startsWith("TOTP_VAULT_KEY="),
			);

			expect(baseUrl).toBeDefined();
			expect(secretKey).toBeDefined();
			expect(totpKey).toBeDefined();
			if (!baseUrl || !secretKey || !totpKey) return;

			expect(baseUrl).toContain(mockSchema.projectName);

			// Check base64 lengths and format
			const secretKeyValue = secretKey.split("=")[1];
			const totpKeyValue = totpKey.split("=")[1];

			expect(secretKeyValue).toBeDefined();
			expect(totpKeyValue).toBeDefined();
			if (!secretKeyValue || !totpKeyValue) return;

			expect(secretKeyValue).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
			expect(secretKeyValue.length).toBeGreaterThanOrEqual(86);
			expect(secretKeyValue.length).toBeLessThanOrEqual(88);

			expect(totpKeyValue).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
			expect(totpKeyValue.length).toBeGreaterThanOrEqual(42);
			expect(totpKeyValue.length).toBeLessThanOrEqual(44);

			// Check mounts
			expect(result.mounts).toHaveLength(1);
			const mount = result.mounts[0];
			expect(mount).toBeDefined();
			if (!mount) return;
			expect(mount.content).toContain(mockSchema.projectName);
			expect(mount.content).toMatch(/secret=[A-Za-z0-9+/]{86,88}/);
			expect(mount.content).toMatch(/totp=[A-Za-z0-9+/]{42,44}/);
		});
	});

	describe("Should populate envs, domains and mounts in the case we didn't used any variable", () => {
		it("should populate envs, domains and mounts in the case we didn't used any variable", () => {
			const template: CompleteTemplate = {
				metadata: {} as any,
				variables: {},
				config: {
					domains: [
						{
							serviceName: "plausible",
							port: 8000,
							host: "${hash}",
						},
					],
					env: {
						BASE_URL: "http://${domain}",
						SECRET_KEY_BASE: "${password:32}",
						TOTP_VAULT_KEY: "${base64:128}",
					},
					mounts: [
						{
							filePath: "/config/secrets.txt",
							content: "random_domain=${domain}\nsecret=${password:32}",
						},
					],
				},
			};

			const result = processTemplate(template, mockSchema);
			expect(result.envs).toHaveLength(3);
			expect(result.domains).toHaveLength(1);
			expect(result.mounts).toHaveLength(1);
		});
	});
});
