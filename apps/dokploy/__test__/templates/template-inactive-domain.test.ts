import { describe, expect, it } from "vitest";

interface DomainConfig {
	serviceName: string;
	port: number;
	path?: string;
	host?: string;
	active?: boolean;
	enabled?: boolean;
}

interface CompleteTemplate {
	config: {
		domains: DomainConfig[];
	};
}

function processDomains(
	template: CompleteTemplate,
	variables: Record<string, string>,
): Array<DomainConfig & { enabled: boolean; host: string }> {
	if (
		!template?.config?.domains ||
		template.config.domains.length === 0 ||
		template.config.domains.every((domain) => !domain.serviceName)
	) {
		return [];
	}

	return template.config.domains.map((domain: DomainConfig) => ({
		...domain,
		enabled:
			domain.enabled !== undefined
				? Boolean(domain.enabled)
				: domain.active !== undefined
					? Boolean(domain.active)
					: true,
		host: domain.host || "test.example.com",
	}));
}

describe("Template & Blueprint Inactive Domains (Issue #5390)", () => {
	it("processes domain with active = false as enabled = false", () => {
		const template: CompleteTemplate = {
			config: {
				domains: [
					{
						serviceName: "elasticsearch",
						port: 9200,
						active: false,
						host: "es.example.com",
					},
					{
						serviceName: "kibana",
						port: 5601,
						active: true,
						host: "kibana.example.com",
					},
				],
			},
		};

		const processed = processDomains(template, {});
		expect(processed).toHaveLength(2);
		expect(processed[0]).toMatchObject({
			serviceName: "elasticsearch",
			port: 9200,
			enabled: false,
		});
		expect(processed[1]).toMatchObject({
			serviceName: "kibana",
			port: 5601,
			enabled: true,
		});
	});

	it("processes domain with enabled = false as enabled = false", () => {
		const template: CompleteTemplate = {
			config: {
				domains: [
					{
						serviceName: "redis-insight",
						port: 8001,
						enabled: false,
					},
				],
			},
		};

		const processed = processDomains(template, {});
		expect(processed[0]?.enabled).toBe(false);
	});

	it("defaults enabled = true when neither active nor enabled is specified", () => {
		const template: CompleteTemplate = {
			config: {
				domains: [
					{
						serviceName: "web",
						port: 80,
					},
				],
			},
		};

		const processed = processDomains(template, {});
		expect(processed[0]?.enabled).toBe(true);
	});

	it("prefers enabled over active if both are provided", () => {
		const template: CompleteTemplate = {
			config: {
				domains: [
					{
						serviceName: "api",
						port: 3000,
						enabled: false,
						active: true,
					},
				],
			},
		};

		const processed = processDomains(template, {});
		expect(processed[0]?.enabled).toBe(false);
	});
});
