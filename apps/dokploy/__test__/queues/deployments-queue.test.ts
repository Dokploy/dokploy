import { beforeEach, describe, expect, it, vi } from "vitest";
import { processDeploymentJob } from "../../server/queues/deployments-queue";
import type { InMemoryJob } from "../../server/queues/in-memory-queue";
import type { DeploymentJob } from "../../server/queues/queue-types";

const mocks = vi.hoisted(() => ({
	deployApplication: vi.fn(),
	deployCompose: vi.fn(),
	deployPreviewApplication: vi.fn(),
	findApplicationById: vi.fn(),
	findComposeById: vi.fn(),
	findPreviewDeploymentById: vi.fn(),
	rebuildApplication: vi.fn(),
	rebuildCompose: vi.fn(),
	rebuildPreviewApplication: vi.fn(),
	updateApplicationStatus: vi.fn(),
	updateCompose: vi.fn(),
	updatePreviewDeployment: vi.fn(),
}));

vi.mock("@dokploy/server", () => mocks);

const toJob = (data: DeploymentJob): InMemoryJob => ({
	id: "job-1",
	name: "deployments",
	data,
	timestamp: 0,
	getState: () => Promise.resolve("active"),
	remove: () => Promise.resolve(),
});

const applicationJob: DeploymentJob = {
	applicationId: "app-1",
	titleLog: "deploy",
	descriptionLog: "",
	type: "deploy",
	applicationType: "application",
};

const composeJob: DeploymentJob = {
	composeId: "compose-1",
	titleLog: "deploy",
	descriptionLog: "",
	type: "deploy",
	applicationType: "compose",
};

const previewJob: DeploymentJob = {
	applicationId: "app-1",
	previewDeploymentId: "preview-1",
	titleLog: "deploy",
	descriptionLog: "",
	type: "deploy",
	applicationType: "application-preview",
};

describe("processDeploymentJob", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "log").mockImplementation(() => {});
		mocks.findApplicationById.mockResolvedValue({
			applicationStatus: "running",
		});
		mocks.findComposeById.mockResolvedValue({ composeStatus: "running" });
		mocks.findPreviewDeploymentById.mockResolvedValue({
			previewStatus: "running",
		});
	});

	it("keeps the running status when the deploy succeeds", async () => {
		await processDeploymentJob(toJob(applicationJob));

		expect(mocks.deployApplication).toHaveBeenCalledTimes(1);
		expect(mocks.updateApplicationStatus).toHaveBeenCalledTimes(1);
		expect(mocks.updateApplicationStatus).toHaveBeenCalledWith(
			"app-1",
			"running",
		);
	});

	it("marks the application as error when the deploy throws", async () => {
		mocks.deployApplication.mockRejectedValueOnce(new Error("boom"));

		await processDeploymentJob(toJob(applicationJob));

		expect(mocks.updateApplicationStatus).toHaveBeenLastCalledWith(
			"app-1",
			"error",
		);
	});

	it("marks the application as error when the rebuild throws", async () => {
		mocks.rebuildApplication.mockRejectedValueOnce(new Error("boom"));

		await processDeploymentJob(toJob({ ...applicationJob, type: "redeploy" }));

		expect(mocks.updateApplicationStatus).toHaveBeenLastCalledWith(
			"app-1",
			"error",
		);
	});

	it("marks the compose as error when the deploy throws", async () => {
		mocks.deployCompose.mockRejectedValueOnce(new Error("boom"));

		await processDeploymentJob(toJob(composeJob));

		expect(mocks.updateCompose).toHaveBeenLastCalledWith("compose-1", {
			composeStatus: "error",
		});
	});

	it("marks the preview deployment as error when the deploy throws", async () => {
		mocks.deployPreviewApplication.mockRejectedValueOnce(new Error("boom"));

		await processDeploymentJob(toJob(previewJob));

		expect(mocks.updatePreviewDeployment).toHaveBeenLastCalledWith(
			"preview-1",
			{ previewStatus: "error" },
		);
	});

	it("keeps the done status when the application already finished", async () => {
		mocks.deployApplication.mockRejectedValueOnce(new Error("boom"));
		mocks.findApplicationById.mockResolvedValue({
			applicationStatus: "done",
		});

		await processDeploymentJob(toJob(applicationJob));

		expect(mocks.updateApplicationStatus).toHaveBeenCalledTimes(1);
		expect(mocks.updateApplicationStatus).toHaveBeenLastCalledWith(
			"app-1",
			"running",
		);
	});

	it("keeps the done status when the compose already finished", async () => {
		mocks.deployCompose.mockRejectedValueOnce(new Error("boom"));
		mocks.findComposeById.mockResolvedValue({ composeStatus: "done" });

		await processDeploymentJob(toJob(composeJob));

		expect(mocks.updateCompose).toHaveBeenCalledTimes(1);
		expect(mocks.updateCompose).toHaveBeenLastCalledWith("compose-1", {
			composeStatus: "running",
		});
	});

	it("keeps the error status the helper already wrote", async () => {
		mocks.deployApplication.mockRejectedValueOnce(new Error("boom"));
		mocks.findApplicationById.mockResolvedValue({
			applicationStatus: "error",
		});

		await processDeploymentJob(toJob(applicationJob));

		expect(mocks.updateApplicationStatus).toHaveBeenCalledTimes(1);
	});

	it("swallows a failing status lookup", async () => {
		mocks.deployApplication.mockRejectedValueOnce(new Error("boom"));
		mocks.findApplicationById.mockRejectedValue(new Error("db down"));

		await expect(
			processDeploymentJob(toJob(applicationJob)),
		).resolves.toBeUndefined();
	});

	it("swallows a failing status rollback", async () => {
		mocks.deployApplication.mockRejectedValueOnce(new Error("boom"));
		mocks.updateApplicationStatus.mockResolvedValueOnce(undefined);
		mocks.updateApplicationStatus.mockRejectedValueOnce(new Error("db down"));

		await expect(
			processDeploymentJob(toJob(applicationJob)),
		).resolves.toBeUndefined();
	});
});
