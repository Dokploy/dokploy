import {
	createCommand,
	getBuildComposeCommand,
} from "@dokploy/server/utils/builders/compose";
import { describe, expect, it } from "vitest";

const base = {
	composeType: "docker-compose" as const,
	appName: "compose-app",
	sourceType: "raw" as const,
	composePath: "./docker-compose.yml",
	command: "",
	mounts: [],
	domains: [],
	environment: {
		environmentId: "env-1",
		env: "",
		project: {
			projectId: "proj-1",
			organizationId: "org-1",
			env: "",
		},
	},
};

describe("compose createCommand with serviceScales", () => {
	it("adds --scale <service>=<replicas> when serviceScales is provided", () => {
		const cmd = createCommand({
			...base,
			serviceScales: [{ serviceName: "web", replicas: 3 }],
		} as any);

		expect(cmd).toContain("up -d --build --remove-orphans --scale web=3");
	});

	it("adds multiple --scale flags sorted by serviceName", () => {
		const cmd = createCommand({
			...base,
			serviceScales: [
				{ serviceName: "worker", replicas: 5 },
				{ serviceName: "api", replicas: 2 },
			],
		} as any);

		expect(cmd).toContain("--scale api=2 --scale worker=5");
	});

	it("omits --scale when serviceScales is empty or undefined", () => {
		const cmdEmpty = createCommand({
			...base,
			serviceScales: [],
		} as any);
		expect(cmdEmpty).not.toContain("--scale");

		const cmdUndefined = createCommand({
			...base,
		} as any);
		expect(cmdUndefined).not.toContain("--scale");
	});

	it("does not add --scale to stack deploy createCommand", () => {
		const cmd = createCommand({
			...base,
			composeType: "stack",
			serviceScales: [{ serviceName: "web", replicas: 4 }],
		} as any);

		expect(cmd).not.toContain("--scale");
	});

	it("leaves custom command untouched even with serviceScales", () => {
		const cmd = createCommand({
			...base,
			command: "compose -p custom-app up -d",
			serviceScales: [{ serviceName: "web", replicas: 3 }],
		} as any);

		expect(cmd).toBe("compose -p custom-app up -d");
	});
});

describe("compose getBuildComposeCommand with Swarm serviceScales", () => {
	it("appends docker service scale commands for stack composeType", async () => {
		const cmd = await getBuildComposeCommand({
			...base,
			composeType: "stack",
			serviceScales: [
				{ serviceName: "web", replicas: 3 },
				{ serviceName: "worker", replicas: 2 },
			],
		} as any);

		expect(cmd).toContain("docker stack deploy");
		expect(cmd).toContain('docker service scale "compose-app_web=3"');
		expect(cmd).toContain('docker service scale "compose-app_worker=2"');
		expect(cmd).toContain("Docker service scale failed for web");
	});

	it("does not append swarm service scale commands for docker-compose type", async () => {
		const cmd = await getBuildComposeCommand({
			...base,
			composeType: "docker-compose",
			serviceScales: [{ serviceName: "web", replicas: 3 }],
		} as any);

		expect(cmd).not.toContain("docker service scale");
		expect(cmd).toContain("--scale web=3");
	});
});
