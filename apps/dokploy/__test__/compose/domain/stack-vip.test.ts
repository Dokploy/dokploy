import type { Compose } from "@dokploy/server/services/compose";
import type { Domain } from "@dokploy/server/services/domain";
import { addDomainToCompose } from "@dokploy/server/utils/docker/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const compose = (composeFile: string, overrides: Partial<Compose> = {}) =>
	({
		appName: "shop",
		composeType: "stack",
		composePath: "docker-compose.yml",
		sourceType: "raw",
		serverId: null,
		isolatedDeployment: false,
		randomize: false,
		suffix: "",
		composeFile,
		...overrides,
	}) as unknown as Compose;

const domain = {
	host: "shop.example.com",
	port: 8080,
	https: true,
	uniqueConfigKey: 7,
	customEntrypoint: null,
	certificateType: "letsencrypt",
	serviceName: "web",
	path: "/",
	internalPath: "/",
	stripPath: false,
	middlewares: null,
	enabled: true,
} as unknown as Domain;

const labelsOf = async (file: string, overrides: Partial<Compose> = {}) => {
	const result = await addDomainToCompose(compose(file, overrides), [domain]);
	const service = result?.services?.web;
	return (
		overrides.composeType === "docker-compose"
			? service?.labels
			: service?.deploy?.labels
	) as string[] | Record<string, string>;
};

describe("stack domains route through the Swarm VIP", () => {
	it("uses the VIP and the shared transport for every router service", async () => {
		const labels = await labelsOf("services:\n  web:\n    image: nginx\n");

		expect(labels).toContain("traefik.swarm.lbswarm=true");
		for (const entrypoint of ["web", "websecure"]) {
			expect(labels).toContain(
				`traefik.http.services.shop-7-${entrypoint}.loadbalancer.serverstransport=dokploy-vip@file`,
			);
		}
	});

	it("keeps a value the user set", async () => {
		const list = await labelsOf(
			"services:\n  web:\n    image: nginx\n    deploy:\n      labels: [traefik.swarm.lbswarm=false]\n",
		);
		expect(list).toContain("traefik.swarm.lbswarm=false");
		expect(list).not.toContain("traefik.swarm.lbswarm=true");

		const map = await labelsOf(
			"services:\n  web:\n    image: nginx\n    deploy:\n      labels:\n        traefik.swarm.lbswarm: 'false'\n",
		);
		expect(map).toMatchObject({
			"traefik.swarm.lbswarm": "false",
			"traefik.http.services.shop-7-web.loadbalancer.serverstransport":
				"dokploy-vip@file",
		});
	});

	it("routes a service without a VIP by its name, through the shared transport", async () => {
		const dnsrr = (await labelsOf(
			"services:\n  web:\n    image: nginx\n    deploy:\n      endpoint_mode: dnsrr\n",
		)) as string[];

		expect(dnsrr.some((label) => label.includes("lbswarm"))).toBe(false);
		for (const entrypoint of ["web", "websecure"]) {
			expect(dnsrr).toContain(
				`traefik.http.services.shop-7-${entrypoint}.loadbalancer.server.url=http://shop_web:8080`,
			);
			expect(dnsrr).toContain(
				`traefik.http.services.shop-7-${entrypoint}.loadbalancer.serverstransport=dokploy-vip@file`,
			);
		}
		expect(dnsrr.some((label) => label.includes(".server.port="))).toBe(false);
	});

	it("leaves plain Compose on container addresses", async () => {
		const plain = await labelsOf("services:\n  web:\n    image: nginx\n", {
			composeType: "docker-compose",
		});
		expect(
			(plain as string[]).some(
				(label) =>
					label.includes("lbswarm") || label.includes("serverstransport"),
			),
		).toBe(false);
	});

	describe("with DOKPLOY_SWARM_ENDPOINT_MODE=dnsrr", () => {
		beforeEach(() => {
			vi.stubEnv("DOKPLOY_SWARM_ENDPOINT_MODE", "dnsrr");
		});
		afterEach(() => {
			vi.unstubAllEnvs();
		});

		const deployed = (file: string, overrides: Partial<Compose> = {}) =>
			addDomainToCompose(compose(file, overrides), [domain]);

		it("gives every Stack service without a mode DNS round robin, routed by name", async () => {
			const result = await deployed(
				"services:\n  web:\n    image: nginx\n  worker:\n    image: busybox\n",
			);

			expect(result?.services?.web?.deploy?.endpoint_mode).toBe("dnsrr");
			expect(result?.services?.worker?.deploy?.endpoint_mode).toBe("dnsrr");
			expect(result?.services?.web?.deploy?.labels).toContain(
				"traefik.http.services.shop-7-web.loadbalancer.server.url=http://shop_web:8080",
			);
		});

		it("keeps the VIP where the file sets a mode or publishes through the ingress", async () => {
			const result = await deployed(
				[
					"services:",
					"  web:",
					"    image: nginx",
					"    deploy:",
					"      endpoint_mode: vip",
					"  short:",
					"    image: nginx",
					'    ports: ["8081:80"]',
					"  long:",
					"    image: nginx",
					"    ports:",
					"      - target: 80",
					"        published: 8082",
					"  host:",
					"    image: nginx",
					"    ports:",
					"      - target: 80",
					"        published: 8083",
					"        mode: host",
					"",
				].join("\n"),
			);

			expect(result?.services?.web?.deploy?.endpoint_mode).toBe("vip");
			expect(result?.services?.web?.deploy?.labels).toContain(
				"traefik.swarm.lbswarm=true",
			);
			expect(result?.services?.short?.deploy?.endpoint_mode).toBeUndefined();
			expect(result?.services?.long?.deploy?.endpoint_mode).toBeUndefined();
			expect(result?.services?.host?.deploy?.endpoint_mode).toBe("dnsrr");
		});

		it("leaves plain Compose files alone", async () => {
			const result = await deployed("services:\n  web:\n    image: nginx\n", {
				composeType: "docker-compose",
			});

			expect(result?.services?.web?.deploy?.endpoint_mode).toBeUndefined();
		});
	});

	it("drops the labels with the domain on the next deploy", async () => {
		const result = await addDomainToCompose(
			compose("services:\n  web:\n    image: nginx\n"),
			[{ ...domain, enabled: false } as Domain],
		);
		expect(result?.services?.web?.deploy?.labels ?? []).toEqual([]);
	});
});
