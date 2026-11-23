import type { ComposeSpecification } from "@dokploy/server";
import {
	applyReplicaOverrides,
	readServicePlacement,
} from "@dokploy/server/services/scaling/compose-overrides";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const spec = (yaml: string) => parse(yaml) as ComposeSpecification;

const pool = (name: string) => ({
	nodeTarget: "pool" as const,
	hostname: null,
	pool: name,
	maxReplicasPerNode: 0,
});

describe("stack placement overrides", () => {
	it("writes the placement into deploy.placement and keeps the file's other constraints", () => {
		const file = spec(`
services:
  api:
    image: api
    deploy:
      replicas: 2
      placement:
        constraints: ["node.labels.zone == eu", "node.role == worker"]
        preferences: [{ spread: node.labels.zone }]
`);
		const [outcome] = applyReplicaOverrides(
			file,
			[
				{
					serviceName: "api",
					replicas: null,
					placement: { ...pool("web"), maxReplicasPerNode: 1 },
				},
			],
			"stack",
		);

		expect(outcome?.applied).toBe(true);
		expect(file.services?.api?.deploy).toEqual({
			replicas: 2,
			placement: {
				constraints: [
					"node.labels.zone == eu",
					"node.labels.dokploy.pool==web",
				],
				preferences: [{ spread: "node.labels.zone" }],
				max_replicas_per_node: 1,
			},
		});
	});

	it("leaves the count to the file when only placement is saved", () => {
		const file = spec("services:\n  api:\n    image: api\n    scale: 3\n");
		applyReplicaOverrides(
			file,
			[{ serviceName: "api", replicas: null, placement: pool("web") }],
			"stack",
		);
		expect(file.services?.api?.scale).toBe(3);
		expect(file.services?.api?.deploy?.replicas).toBeUndefined();
	});

	it("ignores placement for plain Docker Compose", () => {
		const file = spec("services:\n  api:\n    image: api\n");
		applyReplicaOverrides(
			file,
			[{ serviceName: "api", replicas: 2, placement: pool("web") }],
			"docker-compose",
		);
		expect(file.services?.api?.deploy).toEqual({ replicas: 2 });
	});

	it("reads the effective placement for the Scaling tab", () => {
		const service = spec(`
services:
  api:
    image: api
    deploy:
      placement:
        constraints: ["node.hostname == vm-1"]
`).services?.api;

		expect(readServicePlacement(service, null)).toMatchObject({
			nodeTarget: "node",
			hostname: "vm-1",
		});
		expect(readServicePlacement(service, pool("db"))).toMatchObject({
			nodeTarget: "pool",
			pool: "db",
			otherConstraints: [],
		});
		expect(readServicePlacement(undefined, null)).toMatchObject({
			nodeTarget: "any",
		});
	});
});
