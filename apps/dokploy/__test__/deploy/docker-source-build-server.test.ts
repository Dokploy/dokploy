import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/db", () => {
	const chain: any = {
		set: vi.fn(() => chain),
		values: vi.fn(() => chain),
		where: vi.fn(() => chain),
		returning: vi.fn().mockResolvedValue([{ deploymentId: "dep-1" }]),
	};
	return {
		db: {
			insert: vi.fn(() => chain),
			update: vi.fn(() => chain),
			delete: vi.fn(() => chain),
			query: {
				applications: { findFirst: vi.fn() },
				deployments: { findMany: vi.fn().mockResolvedValue([]) },
			},
		},
	};
});

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	ExecError: class ExecError extends Error {},
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(async (serverId: string) => ({ serverId })),
}));

vi.mock("@dokploy/server/services/admin", () => ({
	getDokployUrl: vi.fn().mockResolvedValue("http://localhost:3000"),
}));

vi.mock("@dokploy/server/utils/notifications/build-success", () => ({
	sendBuildSuccessNotifications: vi.fn(),
}));

vi.mock("@dokploy/server/utils/notifications/build-error", () => ({
	sendBuildErrorNotifications: vi.fn(),
}));

vi.mock("@dokploy/server/utils/builders", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/builders")
	>("@dokploy/server/utils/builders");
	return {
		...actual,
		getBuildCommand: vi.fn().mockResolvedValue("build;"),
		mechanizeDockerContainer: vi.fn(),
	};
});

import { db } from "@dokploy/server/db";
import {
	deployApplication,
	rebuildApplication,
} from "@dokploy/server/services/application";
import { createDeployment } from "@dokploy/server/services/deployment";
import { mechanizeDockerContainer } from "@dokploy/server/utils/builders";
import {
	getBuildExecutionServerId,
	getBuildServerId,
} from "@dokploy/server/utils/builders/build-server";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";

const mockApplication = (overrides: Record<string, unknown> = {}) => ({
	applicationId: "app-1",
	name: "App",
	appName: "app-abc",
	sourceType: "docker",
	dockerImage: "nginx:alpine",
	serverId: "deploy-server",
	buildServerId: "build-server",
	environmentId: "env-1",
	environment: { projectId: "project-1", project: {} },
	domains: [],
	...overrides,
});

const setup = (overrides: Record<string, unknown> = {}) => {
	const application = mockApplication(overrides);
	vi.mocked(db.query.applications.findFirst).mockResolvedValue(
		application as any,
	);
	return application;
};

const remoteCalls = () =>
	vi.mocked(execAsyncRemote).mock.calls.map(([serverId, command]) => ({
		serverId,
		command,
	}));

const insertedDeployment = () => {
	const chain = vi.mocked(db.insert).mock.results[0]?.value;
	return chain.values.mock.calls[0][0];
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("getBuildExecutionServerId", () => {
	it("ignores the build server for docker sources", () => {
		const application = {
			sourceType: "docker",
			serverId: "deploy-server",
			buildServerId: "build-server",
		} as const;

		expect(getBuildServerId(application)).toBeNull();
		expect(getBuildExecutionServerId(application)).toBe("deploy-server");
	});

	it("uses the build server for sources that are built", () => {
		const application = {
			sourceType: "git",
			serverId: "deploy-server",
			buildServerId: "build-server",
		} as const;

		expect(getBuildServerId(application)).toBe("build-server");
		expect(getBuildExecutionServerId(application)).toBe("build-server");
	});

	it("falls back to the deploy server when no build server is set", () => {
		const application = {
			sourceType: "github",
			serverId: "deploy-server",
			buildServerId: null,
		} as const;

		expect(getBuildServerId(application)).toBeNull();
		expect(getBuildExecutionServerId(application)).toBe("deploy-server");
	});
});

describe("docker source with a leftover build server", () => {
	it("pulls the image on the deploy server", async () => {
		setup();

		await deployApplication({
			applicationId: "app-1",
			titleLog: "Deploy",
			descriptionLog: "",
		});

		const pullCalls = remoteCalls().filter(({ command }) =>
			command.includes("docker pull"),
		);
		expect(pullCalls.map(({ serverId }) => serverId)).toEqual([
			"deploy-server",
		]);
		expect(
			remoteCalls().some(({ serverId }) => serverId === "build-server"),
		).toBe(false);
		expect(
			vi.mocked(mechanizeDockerContainer).mock.calls[0]?.[0],
		).toMatchObject({ serverId: "deploy-server" });
	});

	it("rebuilds on the deploy server", async () => {
		setup();

		await rebuildApplication({
			applicationId: "app-1",
			titleLog: "Rebuild",
			descriptionLog: "",
		});

		expect(
			remoteCalls().every(({ serverId }) => serverId === "deploy-server"),
		).toBe(true);
	});

	it("writes the log on the deploy server without recording a build server", async () => {
		setup();

		await createDeployment({
			applicationId: "app-1",
			title: "Deploy",
			description: "",
		});

		const [logCall] = remoteCalls();
		expect(logCall?.serverId).toBe("deploy-server");
		expect(logCall?.command).toContain("Building on Remote Server");
		expect(insertedDeployment()).not.toHaveProperty("buildServerId");
	});
});

describe("deployment log for built sources", () => {
	it("writes the log on the build server and records it", async () => {
		setup({ sourceType: "git" });

		await createDeployment({
			applicationId: "app-1",
			title: "Deploy",
			description: "",
		});

		const [logCall] = remoteCalls();
		expect(logCall?.serverId).toBe("build-server");
		expect(logCall?.command).toContain("Building on Build Server");
		expect(insertedDeployment()).toMatchObject({
			buildServerId: "build-server",
		});
	});

	it("does not claim a build server when none is set", async () => {
		setup({ sourceType: "git", buildServerId: null });

		await createDeployment({
			applicationId: "app-1",
			title: "Deploy",
			description: "",
		});

		const [logCall] = remoteCalls();
		expect(logCall?.serverId).toBe("deploy-server");
		expect(logCall?.command).toContain("Building on Remote Server");
		expect(insertedDeployment()).not.toHaveProperty("buildServerId");
	});
});
