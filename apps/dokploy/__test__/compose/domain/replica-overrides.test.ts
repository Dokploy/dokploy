import type { Compose } from "@dokploy/server/services/compose";
import { addDomainToCompose } from "@dokploy/server/utils/docker/domain";
import { describe, expect, it } from "vitest";

const compose = (overrides: Partial<Compose> = {}) =>
	({
		appName: "shop",
		composeType: "docker-compose",
		composePath: "docker-compose.yml",
		sourceType: "raw",
		serverId: null,
		isolatedDeployment: false,
		randomize: false,
		suffix: "",
		composeFile: `
services:
  web:
    image: nginx
    scale: 2
  db:
    image: postgres
`,
		...overrides,
	}) as unknown as Compose;

describe("addDomainToCompose replica overrides", () => {
	it("writes saved replica counts into the converted file", async () => {
		const result = await addDomainToCompose(
			compose(),
			[],
			[{ serviceName: "web", replicas: 4 }],
		);
		expect(result?.services?.web?.scale).toBeUndefined();
		expect(result?.services?.web?.deploy?.replicas).toBe(4);
		expect(result?.services?.db?.deploy?.replicas).toBeUndefined();
	});

	it("leaves the file alone without overrides", async () => {
		const result = await addDomainToCompose(compose(), []);
		expect(result?.services?.web?.scale).toBe(2);
		expect(result?.services?.web?.deploy?.replicas).toBeUndefined();
	});

	it("matches overrides against randomized service names", async () => {
		const result = await addDomainToCompose(
			compose({ randomize: true, suffix: "abc" }),
			[],
			[{ serviceName: "web-abc", replicas: 3 }],
		);
		expect(result?.services?.["web-abc"]?.deploy?.replicas).toBe(3);
	});

	it("keeps stack overrides beside the labels Dokploy adds", async () => {
		const result = await addDomainToCompose(
			compose({ composeType: "stack" }),
			[],
			[{ serviceName: "web", replicas: 6 }],
		);
		expect(result?.services?.web?.deploy?.replicas).toBe(6);
	});
});
