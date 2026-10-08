import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A deployment the user cancelled ends its job normally (so the queue frees the
 * slot and the service's group lock) without flipping the service to "error".
 */

const mocks = vi.hoisted(() => ({
	deployCompose: vi.fn(),
	deployApplication: vi.fn(),
	updateCompose: vi.fn(),
	updateApplicationStatus: vi.fn(),
	findComposeById: vi.fn(),
	findApplicationById: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	deployApplication: mocks.deployApplication,
	deployCompose: mocks.deployCompose,
	deployComposePreview: vi.fn(),
	deployPinnedApplicationImage: vi.fn(),
	deployPreviewApplication: vi.fn(),
	findApplicationById: mocks.findApplicationById,
	findComposeById: mocks.findComposeById,
	// The real predicate matches by property, so any module copy's error works.
	isDeploymentCancelledError: (error: unknown) =>
		typeof error === "object" &&
		error !== null &&
		(error as { deploymentCancelled?: unknown }).deploymentCancelled === true,
	rebuildApplication: vi.fn(),
	rebuildCompose: vi.fn(),
	rebuildComposePreview: vi.fn(),
	rebuildPreviewApplication: vi.fn(),
	updateApplicationStatus: mocks.updateApplicationStatus,
	updateCompose: mocks.updateCompose,
	updatePreviewDeployment: vi.fn(),
}));

import { processDeploymentJob } from "@/server/queues/deployments-queue";

const cancelled = () =>
	Object.assign(new Error("Deployment cancelled."), {
		deploymentCancelled: true,
	});

const composeJob = {
	data: {
		applicationType: "compose",
		type: "deploy",
		composeId: "c1",
		titleLog: "t",
		descriptionLog: "",
	},
} as any;
const applicationJob = {
	data: {
		applicationType: "application",
		type: "deploy",
		applicationId: "a1",
		titleLog: "t",
		descriptionLog: "",
	},
} as any;

const composeStatuses = () =>
	mocks.updateCompose.mock.calls.map((call) => call[1]?.composeStatus);

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "log").mockImplementation(() => {});
	mocks.updateCompose.mockResolvedValue(undefined);
	mocks.updateApplicationStatus.mockResolvedValue(undefined);
	mocks.findComposeById.mockResolvedValue({ composeStatus: "done" });
	mocks.findApplicationById.mockResolvedValue({ applicationStatus: "done" });
});

describe("processDeploymentJob", () => {
	it("a cancelled compose deployment resolves and is not marked error", async () => {
		mocks.deployCompose.mockRejectedValue(cancelled());

		await expect(processDeploymentJob(composeJob)).resolves.toBeUndefined();

		// "running" for the job, then back to what the service had before it.
		expect(composeStatuses()).toEqual(["running", "done"]);
	});

	it("puts back the status the service had when the job started, not a guess", async () => {
		mocks.findComposeById.mockResolvedValue({ composeStatus: "error" });
		mocks.findApplicationById.mockResolvedValue({ applicationStatus: "idle" });
		mocks.deployCompose.mockRejectedValue(cancelled());
		mocks.deployApplication.mockRejectedValue(cancelled());

		await processDeploymentJob(composeJob);
		await processDeploymentJob(applicationJob);

		expect(composeStatuses()).toEqual(["running", "error"]);
		expect(mocks.updateApplicationStatus.mock.calls).toEqual([
			["a1", "running"],
			["a1", "idle"],
		]);
	});

	it("leaves the deploy flow's own fallback status when the earlier one cannot be read", async () => {
		mocks.findComposeById.mockRejectedValue(new Error("db down"));
		mocks.deployCompose.mockRejectedValue(cancelled());

		await expect(processDeploymentJob(composeJob)).resolves.toBeUndefined();

		expect(composeStatuses()).toEqual(["running"]);
	});

	it("a cancelled application deployment resolves and is not marked error", async () => {
		mocks.deployApplication.mockRejectedValue(cancelled());

		await expect(processDeploymentJob(applicationJob)).resolves.toBeUndefined();

		expect(mocks.updateApplicationStatus.mock.calls).toEqual([
			["a1", "running"],
			["a1", "done"],
		]);
	});

	it("any other failure still marks the service as error", async () => {
		mocks.deployCompose.mockRejectedValue(new Error("boom"));
		mocks.deployApplication.mockRejectedValue(new Error("boom"));

		await processDeploymentJob(composeJob);
		await processDeploymentJob(applicationJob);

		expect(composeStatuses()).toEqual(["running", "error"]);
		expect(mocks.updateApplicationStatus.mock.calls).toEqual([
			["a1", "running"],
			["a1", "error"],
		]);
	});
});
