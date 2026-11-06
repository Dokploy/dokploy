import path from "node:path";
import { apiUpdateMount } from "@dokploy/server/db/schema/mount";
import {
	getBaseFilesPath,
	getServerId,
	updateMount,
} from "@dokploy/server/services/mount";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findFirst: vi.fn(),
	updateSet: vi.fn(),
	transaction: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => {
	const chain = {
		set: (data: unknown) => {
			mocks.updateSet(data);
			return {
				where: () => ({
					returning: () => Promise.resolve([{ mountId: "mount-1" }]),
				}),
			};
		},
	};

	return {
		db: {
			query: {
				mounts: {
					findFirst: mocks.findFirst,
				},
			},
			update: () => chain,
			transaction: async (cb: (tx: any) => Promise<any>) => {
				const txMock = {
					update: () => chain,
				};
				return cb(txMock);
			},
		},
	};
});

describe("file mounts serviceType protection (issue #5823)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("apiUpdateMount schema", () => {
		it("does not inject or expose serviceType or foreign keys", () => {
			const parsed = apiUpdateMount.parse({
				mountId: "mount-1",
				content: "NEW_CONTENT=1",
				filePath: "/templates/app.yaml",
			});

			expect(parsed).toMatchObject({
				mountId: "mount-1",
				content: "NEW_CONTENT=1",
				filePath: "/templates/app.yaml",
			});
			expect(parsed).not.toHaveProperty("serviceType");
			expect(parsed).not.toHaveProperty("composeId");
			expect(parsed).not.toHaveProperty("applicationId");
		});
	});

	describe("updateMount", () => {
		it("strips serviceType and foreign keys before updating the database", async () => {
			mocks.findFirst.mockResolvedValue({
				mountId: "mount-1",
				type: "file",
				serviceType: "compose",
				composeId: "compose-1",
				compose: {
					appName: "my-compose-app",
					serverId: null,
				},
			});

			await updateMount("mount-1", {
				content: "UPDATED_CONTENT",
				filePath: "app.yaml",
				// Malicious or accidental overwrite attempts:
				serviceType: "application" as any,
				composeId: "different-compose" as any,
				applicationId: "hijacked-app" as any,
			} as any);

			expect(mocks.updateSet).toHaveBeenCalledOnce();
			const setArgument = mocks.updateSet.mock.calls[0]?.[0];
			expect(setArgument).toMatchObject({
				content: "UPDATED_CONTENT",
				filePath: "app.yaml",
			});
			expect(setArgument).not.toHaveProperty("serviceType");
			expect(setArgument).not.toHaveProperty("composeId");
			expect(setArgument).not.toHaveProperty("applicationId");
		});
	});

	describe("getBaseFilesPath", () => {
		it("resolves compose directory when serviceType is compose and compose relation is set", async () => {
			mocks.findFirst.mockResolvedValue({
				mountId: "mount-1",
				type: "file",
				serviceType: "compose",
				composeId: "compose-1",
				compose: {
					appName: "my-compose-app",
					serverId: null,
				},
			});

			const basePath = await getBaseFilesPath("mount-1");
			expect(basePath).toContain(
				path.join("compose", "my-compose-app", "files"),
			);
			expect(basePath).not.toBe("files");
		});

		it("falls back to compose relation even if serviceType was corrupted to application (repro #5823)", async () => {
			mocks.findFirst.mockResolvedValue({
				mountId: "mount-1",
				type: "file",
				serviceType: "application", // corrupted serviceType in DB!
				composeId: "compose-1",
				application: null,
				compose: {
					appName: "my-compose-app",
					serverId: null,
				},
			});

			const basePath = await getBaseFilesPath("mount-1");
			expect(basePath).toContain(
				path.join("compose", "my-compose-app", "files"),
			);
			expect(basePath).not.toBe("files");
		});

		it("throws TRPCError NOT_FOUND if no valid base path or appName can be resolved", async () => {
			mocks.findFirst.mockResolvedValue({
				mountId: "mount-1",
				type: "file",
				serviceType: "application",
				application: null,
				compose: null,
			});

			await expect(getBaseFilesPath("mount-1")).rejects.toThrowError(
				new TRPCError({
					code: "NOT_FOUND",
					message: "Service directory not found for mount",
				}),
			);
		});
	});

	describe("getServerId", () => {
		it("resolves remote serverId from compose relation even if serviceType was corrupted to application", async () => {
			const mount = {
				mountId: "mount-1",
				serviceType: "application",
				application: null,
				compose: {
					appName: "my-compose-app",
					serverId: "remote-server-123",
				},
			} as any;

			const serverId = await getServerId(mount);
			expect(serverId).toBe("remote-server-123");
		});
	});
});
