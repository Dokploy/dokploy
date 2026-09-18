import { db } from "@dokploy/server/db";
import { createDeploymentPreview } from "@dokploy/server/services/deployment";
import * as previewService from "@dokploy/server/services/preview-deployment";
import * as serverService from "@dokploy/server/services/server";
import * as directoryUtils from "@dokploy/server/utils/filesystem/directory";
import * as execProcess from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
	deleteReturning: vi.fn(),
	insertReturning: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			deployments: {
				findMany: vi.fn(),
				findFirst: vi.fn(),
			},
		},
		delete: vi.fn(() => ({
			where: vi.fn(() => ({
				returning: dbMocks.deleteReturning,
			})),
		})),
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				returning: dbMocks.insertReturning,
			})),
		})),
	},
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn(),
	updateApplicationStatus: vi.fn(),
}));

vi.mock("@dokploy/server/services/preview-deployment", () => ({
	findPreviewDeploymentById: vi.fn(),
	updatePreviewDeployment: vi.fn(),
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(),
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

describe("preview deployment pruning", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		const retainedDeployments = Array.from({ length: 10 }, (_, index) => ({
			deploymentId: `retained-deployment-${index}`,
			buildServerId: "build-server-id",
			serverId: null,
			logPath: `/tmp/retained-deployment-${index}.log`,
			rollbackId: null,
		}));

		const prunedDeployment = {
			deploymentId: "pruned-deployment-id",
			buildServerId: "previous-build-server-id",
			serverId: null,
			logPath: "/tmp/pruned-deployment.log",
			rollbackId: null,
		};

		vi.mocked(db.query.deployments.findFirst).mockResolvedValue(
			prunedDeployment as any,
		);

		vi.mocked(db.query.deployments.findMany).mockResolvedValue([
			...retainedDeployments,
			prunedDeployment,
		] as any);

		vi.mocked(previewService.findPreviewDeploymentById).mockResolvedValue({
			previewDeploymentId: "preview-id",
			appName: "preview-test-application",
			application: {
				applicationId: "application-id",
				serverId: "deployment-server-id",
				buildServerId: "build-server-id",
			},
		} as any);

		vi.mocked(serverService.findServerById).mockResolvedValue({
			serverId: "build-server-id",
		} as any);

		dbMocks.deleteReturning.mockResolvedValue([prunedDeployment]);

		dbMocks.insertReturning.mockResolvedValue([
			{
				deploymentId: "new-deployment-id",
				logPath: "/tmp/new-deployment.log",
			},
		]);

		vi.mocked(execProcess.execAsyncRemote).mockResolvedValue({
			stdout: "",
			stderr: "",
		} as any);
	});

	it("removes logs and source when the last deployment for a historical build server is pruned", async () => {
		await createDeploymentPreview({
			title: "Preview deployment",
			description: "",
			previewDeploymentId: "preview-id",
		});

		expect(execProcess.execAsyncRemote).toHaveBeenCalledWith(
			"previous-build-server-id",
			"rm -f /tmp/pruned-deployment.log;",
		);

		expect(directoryUtils.removeDirectoryCode).toHaveBeenCalledWith(
			"preview-test-application",
			"previous-build-server-id",
		);

		expect(directoryUtils.removeDirectoryCode).not.toHaveBeenCalledWith(
			"preview-test-application",
			"build-server-id",
		);

		expect(execProcess.execAsyncRemote).toHaveBeenCalledWith(
			"build-server-id",
			expect.stringContaining("Initializing deployment"),
		);
	});

	it("keeps historical deployment records when source cleanup fails", async () => {
		vi.mocked(directoryUtils.removeDirectoryCode).mockRejectedValueOnce(
			new Error("Historical build server is unavailable"),
		);

		await createDeploymentPreview({
			title: "Preview deployment",
			description: "",
			previewDeploymentId: "preview-id",
		});

		expect(directoryUtils.removeDirectoryCode).toHaveBeenCalledWith(
			"preview-test-application",
			"previous-build-server-id",
		);

		expect(db.query.deployments.findFirst).not.toHaveBeenCalled();
		expect(db.delete).not.toHaveBeenCalled();
	});
});
