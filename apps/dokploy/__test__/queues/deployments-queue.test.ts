import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InMemoryJob } from "../../server/queues/in-memory-queue";
import type { DeploymentJob } from "../../server/queues/queue-types";

const mocks = vi.hoisted(() => ({
	deployApplication: vi.fn(),
	deployCompose: vi.fn(),
	deployPreviewApplication: vi.fn(),
	findPreviewDeploymentRecordById: vi.fn(),
	rebuildApplication: vi.fn(),
	rebuildCompose: vi.fn(),
	rebuildPreviewApplication: vi.fn(),
	updateApplicationStatus: vi.fn(),
	updateCompose: vi.fn(),
	updatePreviewDeployment: vi.fn(),
}));

vi.mock("@dokploy/server", () => mocks);

import {
	DEFAULT_DEPLOYMENT_JOB_TIMEOUT_MS,
	processDeploymentJob,
	resolveDeploymentJobTimeoutMs,
} from "../../server/queues/deployments-queue";

const createJob = (data: DeploymentJob): InMemoryJob => ({
	id: "job-1",
	name: "deployments",
	data,
	timestamp: 1,
	getState: () => Promise.resolve("active"),
	remove: () => Promise.resolve(),
});

const applicationJob = createJob({
	applicationId: "app-1",
	titleLog: "Deploy",
	descriptionLog: "test",
	type: "deploy",
	applicationType: "application",
});

const previewJob = createJob({
	applicationId: "app-1",
	previewDeploymentId: "preview-1",
	titleLog: "Preview",
	descriptionLog: "test",
	type: "deploy",
	applicationType: "application-preview",
});

describe("deployment queue watchdog", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv("DEPLOYMENT_JOB_TIMEOUT_MS", "100");
		mocks.updateApplicationStatus.mockResolvedValue(undefined);
		mocks.updateCompose.mockResolvedValue(undefined);
		mocks.updatePreviewDeployment.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	it("falls back to the default timeout for invalid configuration", () => {
		vi.stubEnv("DEPLOYMENT_JOB_TIMEOUT_MS", "invalid");

		expect(resolveDeploymentJobTimeoutMs()).toBe(
			DEFAULT_DEPLOYMENT_JOB_TIMEOUT_MS,
		);
	});

	it("times out a hung job and resets its application status", async () => {
		vi.useFakeTimers();
		mocks.deployApplication.mockReturnValue(new Promise(() => {}));

		const result = processDeploymentJob(applicationJob);
		const rejection = expect(result).rejects.toThrow(
			"Deployment job timed out after 100ms (application:job-1)",
		);
		await vi.advanceTimersByTimeAsync(100);

		await rejection;
		expect(mocks.updateApplicationStatus).toHaveBeenNthCalledWith(
			1,
			"app-1",
			"running",
		);
		expect(mocks.updateApplicationStatus).toHaveBeenNthCalledWith(
			2,
			"app-1",
			"error",
		);
	});

	it("skips a preview job whose deployment was deleted", async () => {
		mocks.findPreviewDeploymentRecordById.mockResolvedValue(null);

		await processDeploymentJob(previewJob);

		expect(mocks.deployPreviewApplication).not.toHaveBeenCalled();
		expect(mocks.updatePreviewDeployment).not.toHaveBeenCalled();
	});
});
