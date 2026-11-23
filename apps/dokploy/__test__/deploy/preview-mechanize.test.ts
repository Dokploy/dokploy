import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirstPreview = vi.fn();
const mechanizeDockerContainer = vi.fn();
const removeService = vi.fn();

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			previewDeployments: {
				findFirst: (...args: unknown[]) => findFirstPreview(...args),
			},
		},
	},
}));

vi.mock("@dokploy/server/db/schema", () => ({
	previewDeployments: {},
}));

vi.mock("@dokploy/server/utils/builders", () => ({
	mechanizeDockerContainer: (...args: unknown[]) =>
		mechanizeDockerContainer(...args),
}));

vi.mock("@dokploy/server/utils/docker/utils", () => ({
	removeService: (...args: unknown[]) => removeService(...args),
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import type { ApplicationNested } from "@dokploy/server/utils/builders";
import { mechanizePreviewDockerContainer } from "@dokploy/server/utils/builders/preview";

const application = {
	appName: "preview-app-abc123",
	serverId: "server-1",
} as ApplicationNested;
const existing = { previewDeploymentId: "pd-1" };

describe("mechanizePreviewDockerContainer", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("creates the service while the preview still exists", async () => {
		findFirstPreview.mockResolvedValue(existing);

		await expect(
			mechanizePreviewDockerContainer(application, "pd-1"),
		).resolves.toBe(true);
		expect(mechanizeDockerContainer).toHaveBeenCalledWith(application);
		expect(removeService).not.toHaveBeenCalled();
	});

	it("skips the service when the preview was removed during the build", async () => {
		findFirstPreview.mockResolvedValue(undefined);

		await expect(
			mechanizePreviewDockerContainer(application, "pd-1"),
		).resolves.toBe(false);
		expect(mechanizeDockerContainer).not.toHaveBeenCalled();
		expect(removeService).not.toHaveBeenCalled();
	});

	it("removes the service when the preview was removed while it was created", async () => {
		findFirstPreview
			.mockResolvedValueOnce(existing)
			.mockResolvedValueOnce(undefined);

		await expect(
			mechanizePreviewDockerContainer(application, "pd-1"),
		).resolves.toBe(false);
		expect(mechanizeDockerContainer).toHaveBeenCalledWith(application);
		expect(removeService).toHaveBeenCalledWith(
			"preview-app-abc123",
			"server-1",
		);
	});
});
