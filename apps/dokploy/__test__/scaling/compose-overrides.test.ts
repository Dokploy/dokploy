import type { ComposeSpecification } from "@dokploy/server";
import {
	applyReplicaOverrides,
	describeComposeService,
	hasFixedHostPort,
} from "@dokploy/server/services/scaling/compose-overrides";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const spec = (yaml: string) => parse(yaml) as ComposeSpecification;

describe("hasFixedHostPort", () => {
	it.each([
		[["80"], false],
		[[80], false],
		[["8080:80"], true],
		[["127.0.0.1:8080:80"], true],
		[["127.0.0.1::80"], false],
		[["8000-8010:80"], false],
		[["8080:80/udp"], true],
		[["[::1]:8080:80"], true],
		[["[::1]::80"], false],
		[[{ target: 80 }], false],
		[[{ target: 80, published: 8080 }], true],
		[[{ target: 80, published: "8000-8010" }], false],
	])("%j → %s", (ports, expected) => {
		expect(
			hasFixedHostPort(ports as Parameters<typeof hasFixedHostPort>[0]),
		).toBe(expected);
	});
});

describe("describeComposeService", () => {
	it("reads the mode and the count compose would start", () => {
		expect(
			describeComposeService({ image: "a", scale: 3 }, "docker-compose"),
		).toMatchObject({ mode: "replicated", fileReplicas: 3 });
		expect(
			describeComposeService(
				{ image: "a", deploy: { replicas: 2 } },
				"docker-compose",
			),
		).toMatchObject({ mode: "replicated", fileReplicas: 2 });
		expect(
			describeComposeService(
				{ image: "a", deploy: { mode: "global" } },
				"stack",
			),
		).toMatchObject({ mode: "global", fileReplicas: 1 });
	});

	it("lists what keeps a plain compose service to one container", () => {
		const { singleInstanceReasons } = describeComposeService(
			{
				image: "a",
				container_name: "db",
				ports: ["5432:5432"],
				network_mode: "host",
				networks: { backend: { ipv4_address: "10.5.0.2" } },
			},
			"docker-compose",
		);
		expect(singleInstanceReasons).toHaveLength(4);
	});

	it("does not apply plain-compose limits to stack services", () => {
		const { singleInstanceReasons } = describeComposeService(
			{ image: "a", container_name: "db", ports: ["5432:5432"] },
			"stack",
		);
		expect(singleInstanceReasons).toEqual([]);
	});

	it("treats a disabled or NONE healthcheck as no health check", () => {
		const has = (healthcheck: unknown) =>
			describeComposeService(
				{ image: "a", healthcheck } as never,
				"docker-compose",
			).hasHealthCheck;
		expect(has({ test: ["CMD", "true"] })).toBe(true);
		expect(has({ test: "curl -f localhost" })).toBe(true);
		expect(has({ test: ["NONE"] })).toBe(false);
		expect(has({ disable: true })).toBe(false);
		expect(has(undefined)).toBe(false);
	});
});

describe("applyReplicaOverrides", () => {
	it("writes the saved count and drops a conflicting scale", () => {
		const file = spec(`
services:
  web:
    image: nginx
    scale: 2
  worker:
    image: busybox
    deploy:
      replicas: 1
      labels: [keep=me]
`);
		const outcomes = applyReplicaOverrides(
			file,
			[
				{ serviceName: "web", replicas: 4 },
				{ serviceName: "worker", replicas: 3 },
			],
			"docker-compose",
		);

		expect(outcomes.every((outcome) => outcome.applied)).toBe(true);
		expect(file.services?.web).toEqual({
			image: "nginx",
			deploy: { replicas: 4 },
		});
		expect(file.services?.worker?.deploy).toEqual({
			replicas: 3,
			labels: ["keep=me"],
		});
	});

	it("skips services it cannot express, with a reason", () => {
		const file = spec(`
services:
  agent:
    image: a
    deploy:
      mode: global
  db:
    image: postgres
    container_name: db
`);
		const outcomes = applyReplicaOverrides(
			file,
			[
				{ serviceName: "agent", replicas: 2 },
				{ serviceName: "db", replicas: 2 },
				{ serviceName: "gone", replicas: 2 },
			],
			"docker-compose",
		);

		expect(outcomes.map((outcome) => outcome.applied)).toEqual([
			false,
			false,
			false,
		]);
		expect(outcomes[0]?.reason).toMatch(/global mode/);
		expect(outcomes[1]?.reason).toMatch(/container_name/);
		expect(outcomes[2]?.reason).toMatch(/no longer in the compose file/);
		expect(file.services?.agent?.deploy).toEqual({ mode: "global" });
		expect(file.services?.db?.deploy).toBeUndefined();
	});

	it("still applies a count of one to a single-instance service", () => {
		const file = spec(`
services:
  db:
    image: postgres
    container_name: db
    scale: 1
`);
		const [outcome] = applyReplicaOverrides(
			file,
			[{ serviceName: "db", replicas: 1 }],
			"docker-compose",
		);
		expect(outcome?.applied).toBe(true);
		expect(file.services?.db).toEqual({
			image: "postgres",
			container_name: "db",
			deploy: { replicas: 1 },
		});
	});

	it("applies stack overrides regardless of container_name or ports", () => {
		const file = spec(`
services:
  web:
    image: nginx
    ports: ["80:80"]
`);
		const [outcome] = applyReplicaOverrides(
			file,
			[{ serviceName: "web", replicas: 5 }],
			"stack",
		);
		expect(outcome?.applied).toBe(true);
		expect(file.services?.web?.deploy?.replicas).toBe(5);
	});
});
