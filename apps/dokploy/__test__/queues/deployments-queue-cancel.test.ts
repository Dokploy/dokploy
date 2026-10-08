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
	readServiceStatus: vi.fn(),
	restoreServiceStatusIfUnchanged: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	deployApplication: mocks.deployApplication,
	deployCompose: mocks.deployCompose,
	deployComposePreview: vi.fn(),
	deployPinnedApplicationImage: vi.fn(),
	deployPreviewApplication: vi.fn(),
	// The real predicate matches by property, so any module copy's error works.
	isDeploymentCancelledError: (error: unknown) =>
		typeof error === "object" &&
		error !== null &&
		(error as { deploymentCancelled?: unknown }).deploymentCancelled === true,
	readServiceStatus: mocks.readServiceStatus,
	rebuildApplication: vi.fn(),
	rebuildCompose: vi.fn(),
	rebuildComposePreview: vi.fn(),
	rebuildPreviewApplication: vi.fn(),
	restoreServiceStatusIfUnchanged: mocks.restoreServiceStatusIfUnchanged,
	updateApplicationStatus: mocks.updateApplicationStatus,
	updateCompose: mocks.updateCompose,
	updatePreviewDeployment: vi.fn(),
}));

import { processDeploymentJob } from "@/server/queues/deployments-queue";

/** What the deploy flow throws after settling the service in `settledStatus`. */
const cancelled = (settledStatus?: string) =>
	Object.assign(new Error("Deployment cancelled."), {
		deploymentCancelled: true,
		settledStatus,
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
	mocks.readServiceStatus.mockResolvedValue("done");
	mocks.restoreServiceStatusIfUnchanged.mockResolvedValue(true);
});

describe("processDeploymentJob", () => {
	it("a cancelled compose deployment resolves and is not marked error", async () => {
		mocks.deployCompose.mockRejectedValue(cancelled("done"));

		await expect(processDeploymentJob(composeJob)).resolves.toBeUndefined();

		// Only "running" is written unconditionally; nothing is flipped to error.
		expect(composeStatuses()).toEqual(["running"]);
	});

	it("reads only the status column, not the whole service", async () => {
		mocks.deployCompose.mockResolvedValue(undefined);
		mocks.deployApplication.mockResolvedValue(undefined);

		await processDeploymentJob(composeJob);
		await processDeploymentJob(applicationJob);

		expect(mocks.readServiceStatus.mock.calls).toEqual([
			[{ composeId: "c1" }],
			[{ applicationId: "a1" }],
		]);
	});

	it("puts back the status the service had when the job started, not a guess", async () => {
		mocks.readServiceStatus.mockImplementation(async (service: object) =>
			"composeId" in service ? "error" : "idle",
		);
		mocks.deployCompose.mockRejectedValue(cancelled("done"));
		mocks.deployApplication.mockRejectedValue(cancelled("done"));

		await processDeploymentJob(composeJob);
		await processDeploymentJob(applicationJob);

		// Moved on from the settled status only: the helper is conditional.
		expect(mocks.restoreServiceStatusIfUnchanged.mock.calls).toEqual([
			[{ composeId: "c1" }, "done", "error"],
			[{ applicationId: "a1" }, "done", "idle"],
		]);
		// Never an unconditional write of the old status.
		expect(composeStatuses()).toEqual(["running"]);
		expect(mocks.updateApplicationStatus.mock.calls).toEqual([
			["a1", "running"],
		]);
	});

	it("does not restore anything when the settled status is unknown", async () => {
		mocks.deployCompose.mockRejectedValue(cancelled());

		await expect(processDeploymentJob(composeJob)).resolves.toBeUndefined();

		expect(mocks.restoreServiceStatusIfUnchanged).not.toHaveBeenCalled();
	});

	it("leaves the deploy flow's own fallback status when the earlier one cannot be read", async () => {
		mocks.readServiceStatus.mockRejectedValue(new Error("db down"));
		mocks.deployCompose.mockRejectedValue(cancelled("done"));

		await expect(processDeploymentJob(composeJob)).resolves.toBeUndefined();

		expect(composeStatuses()).toEqual(["running"]);
		expect(mocks.restoreServiceStatusIfUnchanged).not.toHaveBeenCalled();
	});

	it("a failing restore never fails the job", async () => {
		mocks.readServiceStatus.mockResolvedValue("error");
		mocks.restoreServiceStatusIfUnchanged.mockRejectedValue(new Error("db"));
		mocks.deployCompose.mockRejectedValue(cancelled("done"));

		await expect(processDeploymentJob(composeJob)).resolves.toBeUndefined();
	});

	it("a cancelled application deployment resolves and is not marked error", async () => {
		mocks.deployApplication.mockRejectedValue(cancelled("done"));

		await expect(processDeploymentJob(applicationJob)).resolves.toBeUndefined();

		expect(mocks.updateApplicationStatus.mock.calls).toEqual([
			["a1", "running"],
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
		expect(mocks.restoreServiceStatusIfUnchanged).not.toHaveBeenCalled();
	});
});
