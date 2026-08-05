import { db } from "@dokploy/server/db";
import * as applicationService from "@dokploy/server/services/application";
import { removePreviewDeployment } from "@dokploy/server/services/preview-deployment";
import * as dockerUtils from "@dokploy/server/utils/docker/utils";
import * as directoryUtils from "@dokploy/server/utils/filesystem/directory";
import * as execProcess from "@dokploy/server/utils/process/execAsync";
import * as traefikApplication from "@dokploy/server/utils/traefik/application";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			previewDeployments: {
				findFirst: vi.fn(),
			},
		},
		delete: vi.fn(() => ({
			where: vi.fn(() => ({
				returning: vi.fn().mockResolvedValue([]),
			})),
		})),
	},
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn(),
	updateApplicationStatus: vi.fn(),
}));

vi.mock("@dokploy/server/utils/docker/utils", () => ({
	encodeBase64: vi.fn((value: string) => value),
	removeService: vi.fn(),
}));

vi.mock("@dokploy/server/utils/filesystem/directory", () => ({
	removeDirectoryCode: vi.fn(),
	removeDirectoryIfExistsContent: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	ExecError: class ExecError extends Error {},
}));

vi.mock("@dokploy/server/utils/traefik/application", () => ({
	removeTraefikConfig: vi.fn(),
}));

describe("preview deployment cleanup", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		vi.mocked(db.query.previewDeployments.findFirst).mockResolvedValue({
			previewDeploymentId: "preview-id",
			applicationId: "application-id",
			appName: "preview-test-application",
			deployments: [
				{
					buildServerId: "previous-build-server-id",
				},
				{
					buildServerId: "build-server-id",
				},
				{
					buildServerId: null,
				},
			],
			application: {
				applicationId: "application-id",
				serverId: "deployment-server-id",
				buildServerId: "build-server-id",
			},
			domain: null,
		} as any);

		vi.mocked(applicationService.findApplicationById).mockResolvedValue({
			applicationId: "application-id",
			appName: "application-name",
			serverId: "deployment-server-id",
			buildServerId: "build-server-id",
		} as any);
	});

	it("removes preview artifacts from every current and historical build host", async () => {
		await removePreviewDeployment("preview-id");

		expect(execProcess.execAsyncRemote).toHaveBeenCalledTimes(3);

		for (const serverId of [
			"deployment-server-id",
			"build-server-id",
			"previous-build-server-id",
		]) {
			expect(execProcess.execAsyncRemote).toHaveBeenCalledWith(
				serverId,
				expect.stringContaining("preview-test-application"),
			);
		}

		expect(directoryUtils.removeDirectoryIfExistsContent).toHaveBeenCalledWith(
			expect.stringContaining("preview-test-application"),
		);

		expect(directoryUtils.removeDirectoryCode).toHaveBeenCalledTimes(4);

		for (const serverId of [
			null,
			"deployment-server-id",
			"build-server-id",
			"previous-build-server-id",
		]) {
			expect(directoryUtils.removeDirectoryCode).toHaveBeenCalledWith(
				"preview-test-application",
				serverId,
			);
		}

		expect(dockerUtils.removeService).toHaveBeenCalledWith(
			"preview-test-application",
			"deployment-server-id",
		);

		expect(traefikApplication.removeTraefikConfig).toHaveBeenCalledWith(
			"preview-test-application",
			"deployment-server-id",
		);
	});
});
