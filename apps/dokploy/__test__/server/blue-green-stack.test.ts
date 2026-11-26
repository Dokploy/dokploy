import {
	getStackBlueGreenScript,
	redirectToGreen,
	stackBlueGreenIneligibility,
	stripTraefikAndDokployLabels,
} from "@dokploy/server/utils/docker/blue-green-stack";
import type { ComposeSpecification } from "@dokploy/server/utils/docker/types";
import { describe, expect, it } from "vitest";

const spec = (overrides: Record<string, unknown> = {}): ComposeSpecification =>
	({
		services: {
			web: {
				image: "nginx",
				deploy: {
					replicas: 2,
					labels: [
						"traefik.enable=true",
						"traefik.swarm.lbswarm=true",
						"traefik.http.routers.app-1-web.rule=Host(`a.example.com`)",
						"traefik.http.services.app-1-web.loadbalancer.server.port=80",
						"dokploy.application=app",
					],
				},
				...overrides,
			},
			cache: { image: "redis" },
		},
	}) as ComposeSpecification;

describe("stackBlueGreenIneligibility", () => {
	it("accepts a replicated stack with a domain and no state", () => {
		expect(stackBlueGreenIneligibility(spec())).toBeNull();
	});

	it.each([
		["volumes", { volumes: ["data:/data"] }, "volumes"],
		["ports", { ports: ["8080:80"] }, "ports"],
		["global mode", { deploy: { mode: "global" } }, "global"],
		["zero replicas", { deploy: { replicas: 0 } }, "0 replicas"],
	])("refuses %s", (_name, override, text) => {
		expect(stackBlueGreenIneligibility(spec(override))).toContain(text);
	});

	it("refuses a stack with no domain", () => {
		const noDomain = spec({ deploy: { replicas: 1 } });
		expect(stackBlueGreenIneligibility(noDomain)).toBe("no service has a domain");
	});
});

describe("stripTraefikAndDokployLabels", () => {
	it("leaves a twin that no router or attribution sees", () => {
		const web = stripTraefikAndDokployLabels(spec()).services?.web;
		expect(web?.deploy?.labels).toEqual([]);
	});

	it("keeps unrelated labels", () => {
		const withOwn = spec();
		(withOwn.services?.web?.deploy?.labels as string[]).push("team=a");
		expect(
			stripTraefikAndDokployLabels(withOwn).services?.web?.deploy?.labels,
		).toEqual(["team=a"]);
	});
});

describe("redirectToGreen", () => {
	it("replaces the port label by a URL to the twin and drops lbswarm", () => {
		const { spec: result, redirects } = redirectToGreen(spec(), "app");
		const labels = result.services?.web?.deploy?.labels as string[];
		expect(labels).toContain(
			"traefik.http.services.app-1-web.loadbalancer.server.url=http://app-green_web:80",
		);
		expect(labels.some((l) => l.includes("server.port"))).toBe(false);
		expect(labels.some((l) => l.includes("lbswarm"))).toBe(false);
		expect(labels).toContain("traefik.enable=true");
		expect(redirects).toEqual([
			{
				service: "web",
				remove: [
					"traefik.http.services.app-1-web.loadbalancer.server.port",
					"traefik.swarm.lbswarm",
				],
				add: {
					"traefik.http.services.app-1-web.loadbalancer.server.url":
						"http://app-green_web:80",
				},
			},
		]);
	});

	it("reads the port from an existing URL label and never removes the key it adds", () => {
		const byName = spec();
		byName.services!.web!.deploy!.labels = [
			"traefik.http.services.app-1-web.loadbalancer.server.url=http://app_web:3000",
		];
		const { redirects } = redirectToGreen(byName, "app");
		expect(redirects[0]?.add).toEqual({
			"traefik.http.services.app-1-web.loadbalancer.server.url":
				"http://app-green_web:3000",
		});
		expect(redirects[0]?.remove).toEqual([]);
	});

	it("handles labels given as a map", () => {
		const map = spec();
		map.services!.web!.deploy!.labels = {
			"traefik.http.services.app-1-web.loadbalancer.server.port": "80",
		};
		const labels = redirectToGreen(map, "app").spec.services?.web?.deploy
			?.labels as Record<string, string>;
		expect(labels).toEqual({
			"traefik.http.services.app-1-web.loadbalancer.server.url":
				"http://app-green_web:80",
		});
	});
});

describe("getStackBlueGreenScript", () => {
	const script = getStackBlueGreenScript({
		appName: "app",
		composeFile: "docker-compose.yml",
		exportEnv: "FOO=bar",
		spec: spec(),
	});

	it("deploys the twin before touching the running stack", () => {
		const twin = script.indexOf("docker stack deploy -c docker-compose.yml.bg-green.yml app-green");
		const redirect = script.indexOf("traffic moved");
		const real = script.indexOf("docker stack deploy -c docker-compose.yml.bg-redirect.yml app ");
		const final = script.indexOf("docker stack deploy -c docker-compose.yml app ");
		expect(twin).toBeGreaterThan(-1);
		expect(redirect).toBeGreaterThan(twin);
		expect(real).toBeGreaterThan(redirect);
		expect(final).toBeGreaterThan(real);
	});

	it("falls back to a plain deploy when the stack is not running yet", () => {
		expect(script).toContain("else\n  env -i");
	});

	it("only removes a label that it does not re-add", () => {
		expect(script).toContain("--label-rm traefik.swarm.lbswarm");
		expect(script).toContain("--label-add");
	});

	it("takes the URL label back off when a failed deploy restores the live service", () => {
		const restore = script.slice(
			script.indexOf("bg_restore() {"),
			script.indexOf("bg_fail() {"),
		);
		expect(restore).toContain(
			"traefik.http.services.app-1-web.loadbalancer.server.url",
		);
		expect(restore).toContain("traefik.swarm.lbswarm");
	});
});
