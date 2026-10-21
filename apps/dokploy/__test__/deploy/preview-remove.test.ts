import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			previewDeployments: {
				findFirst: vi.fn().mockResolvedValue({
					previewDeploymentId: "pd-1",
					applicationId: "app-1",
					appName: "preview-app-abc123",
				}),
			},
		},
		delete: () => ({
			where: () => ({
				returning: async () => {
					calls.push("deleteRow");
					return [];
				},
			}),
		}),
	},
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn().mockResolvedValue({
		applicationId: "app-1",
		appName: "app",
		serverId: "server-1",
	}),
}));

vi.mock("@dokploy/server/services/deployment", () => ({
	removeDeploymentsByPreviewDeploymentId: async () => {
		calls.push("removeDeployments");
	},
}));

vi.mock("@dokploy/server/utils/docker/utils", () => ({
	removeService: async (appName: string) => {
		calls.push(`removeService:${appName}`);
	},
}));

vi.mock("@dokploy/server/utils/filesystem/directory", () => ({
	removeDirectoryCode: async () => {
		calls.push("removeDirectoryCode");
	},
}));

vi.mock("@dokploy/server/utils/traefik/application", () => ({
	removeTraefikConfig: async () => {
		calls.push("removeTraefikConfig");
	},
}));

vi.mock("@dokploy/server/utils/traefik/domain", () => ({
	manageDomain: vi.fn(),
}));
vi.mock("@dokploy/server/utils/providers/github", () => ({
	authGithub: vi.fn(),
}));
vi.mock("@dokploy/server/services/domain", () => ({ createDomain: vi.fn() }));
vi.mock("@dokploy/server/services/github", () => ({
	findGithubById: vi.fn(),
	getIssueComment: vi.fn(),
}));
vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: vi.fn(),
}));
vi.mock("@dokploy/server/templates", () => ({ generatePassword: vi.fn() }));

import { removePreviewDeployment } from "@dokploy/server/services/preview-deployment";

describe("removePreviewDeployment", () => {
	beforeEach(() => {
		calls.length = 0;
	});

	it("removes the Swarm service only after the preview row is deleted", async () => {
		await removePreviewDeployment("pd-1");

		expect(calls).toEqual([
			"removeDeployments",
			"removeDirectoryCode",
			"removeTraefikConfig",
			"deleteRow",
			"removeService:preview-app-abc123",
		]);
	});
});
