import { buildServerProxyConfig } from "@dokploy/server";
import { describe, expect, it } from "vitest";

const server = {
	appName: "server-abc",
	ipAddress: "203.0.113.10",
	privateIpAddress: "10.0.0.12",
};

const domain = (overrides: {
	host: string;
	https?: boolean;
	enabled?: boolean;
	customEntrypoint?: string | null;
}) => ({
	https: true,
	enabled: true,
	customEntrypoint: null,
	...overrides,
});

describe("buildServerProxyConfig", () => {
	it("forwards http and passes tls through to the remote traefik", () => {
		const config = buildServerProxyConfig(server, [
			domain({ host: "app.example.com" }),
		]);

		expect(config?.http?.routers).toEqual({
			"server-abc-proxy-app-example-com": {
				rule: "Host(`app.example.com`)",
				service: "server-abc-traefik",
				entryPoints: ["web"],
			},
		});
		expect(config?.http?.services).toEqual({
			"server-abc-traefik": {
				loadBalancer: {
					servers: [{ url: "http://10.0.0.12:80" }],
					passHostHeader: true,
				},
			},
		});
		expect(config?.tcp?.routers).toEqual({
			"server-abc-proxy-app-example-com-passthrough": {
				rule: "HostSNI(`app.example.com`)",
				service: "server-abc-traefik",
				entryPoints: ["websecure"],
				tls: { passthrough: true },
			},
		});
		expect(config?.tcp?.services).toEqual({
			"server-abc-traefik": {
				loadBalancer: { servers: [{ address: "10.0.0.12:443" }] },
			},
		});
	});

	it("falls back to the server ip address when no private ip is set", () => {
		const config = buildServerProxyConfig(
			{ ...server, privateIpAddress: null },
			[domain({ host: "app.example.com" })],
		);

		expect(config?.tcp?.services?.["server-abc-traefik"]).toEqual({
			loadBalancer: { servers: [{ address: "203.0.113.10:443" }] },
		});
	});

	it("wraps ipv6 targets in brackets", () => {
		const config = buildServerProxyConfig(
			{ ...server, privateIpAddress: "fd00::12" },
			[domain({ host: "app.example.com" })],
		);

		expect(config?.http?.services?.["server-abc-traefik"]).toEqual({
			loadBalancer: {
				servers: [{ url: "http://[fd00::12]:80" }],
				passHostHeader: true,
			},
		});
		expect(config?.tcp?.services?.["server-abc-traefik"]).toEqual({
			loadBalancer: { servers: [{ address: "[fd00::12]:443" }] },
		});
	});

	it("omits the tcp section when no domain uses https", () => {
		const config = buildServerProxyConfig(server, [
			domain({ host: "plain.example.com", https: false }),
		]);

		expect(Object.keys(config?.http?.routers ?? {})).toEqual([
			"server-abc-proxy-plain-example-com",
		]);
		expect(config?.tcp).toBeUndefined();
	});

	it("creates a single route per host and enables tls if any domain needs it", () => {
		const config = buildServerProxyConfig(server, [
			domain({ host: "app.example.com", https: false }),
			domain({ host: "app.example.com", https: true }),
		]);

		expect(Object.keys(config?.http?.routers ?? {})).toHaveLength(1);
		expect(Object.keys(config?.tcp?.routers ?? {})).toHaveLength(1);
	});

	it("skips disabled, custom entrypoint and wildcard domains", () => {
		const config = buildServerProxyConfig(server, [
			domain({ host: "disabled.example.com", enabled: false }),
			domain({ host: "custom.example.com", customEntrypoint: "metrics" }),
			domain({ host: "*.example.com" }),
		]);

		expect(config).toBeNull();
	});

	it("converts internationalized hosts to punycode", () => {
		const config = buildServerProxyConfig(server, [
			domain({ host: "тест.рф", https: false }),
		]);

		expect(Object.values(config?.http?.routers ?? {})[0]?.rule).toBe(
			"Host(`xn--e1aybc.xn--p1ai`)",
		);
	});
});
