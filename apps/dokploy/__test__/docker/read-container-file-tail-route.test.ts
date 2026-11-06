import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	read: vi.fn(),
	findServer: vi.fn(),
	checkPermission: vi.fn(),
}));

vi.mock("@dokploy/server", async () => {
	const tail = await import("@dokploy/server/services/container-file-tail");
	return {
		...tail,
		readContainerFileTail: mocks.read,
		findServerById: mocks.findServer,
		hasValidLicense: vi.fn(),
	};
});
vi.mock("@dokploy/server/lib/auth", () => ({ validateRequest: vi.fn() }));
vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
	resolvePermissions: vi.fn(),
}));
vi.mock("@/server/api/utils/audit", () => ({ audit: vi.fn() }));
vi.mock("@/utils/schema", async () => {
	const { z } = await import("zod");
	return { uploadFileToContainerSchema: z.object({}) };
});

const { dockerRouter } = await import("@/server/api/routers/docker");
const { ContainerFileTailError } = await import(
	"@dokploy/server/services/container-file-tail"
);

const caller = (authenticated = true) =>
	dockerRouter.createCaller({
		user: authenticated ? { id: "user", role: "owner" } : null,
		session: authenticated ? { activeOrganizationId: "org" } : null,
	} as never);

describe("docker.readContainerFileTail authorization and validation", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.findServer.mockResolvedValue({ organizationId: "org" });
		mocks.read.mockResolvedValue({
			content: "latest",
			truncated: false,
			truncatedByBytes: false,
			truncatedByLines: false,
		});
	});

	it("uses docker.read permission and defaults for a local read", async () => {
		await expect(
			caller().readContainerFileTail({ containerId: "app", path: "/log" }),
		).resolves.toMatchObject({ content: "latest" });
		expect(mocks.checkPermission).toHaveBeenCalledWith(expect.anything(), {
			docker: ["read"],
		});
		expect(mocks.read).toHaveBeenCalledWith(
			"app",
			"/log",
			200,
			65536,
			undefined,
		);
	});

	it("rejects unauthenticated callers before reading", async () => {
		await expect(
			caller(false).readContainerFileTail({ containerId: "app", path: "/log" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.read).not.toHaveBeenCalled();
	});

	it("rejects callers without Docker read permission", async () => {
		mocks.checkPermission.mockRejectedValue(
			new TRPCError({ code: "FORBIDDEN" }),
		);
		await expect(
			caller().readContainerFileTail({ containerId: "app", path: "/log" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mocks.read).not.toHaveBeenCalled();
	});

	it("rejects remote servers owned by another organization", async () => {
		mocks.findServer.mockResolvedValue({ organizationId: "other" });
		await expect(
			caller().readContainerFileTail({
				containerId: "app",
				path: "/log",
				serverId: "remote",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.read).not.toHaveBeenCalled();
	});

	it("forwards authorized remote reads and explicit limits", async () => {
		await caller().readContainerFileTail({
			containerId: "app",
			path: "/log",
			lines: 10,
			maxBytes: 4096,
			serverId: "remote",
		});
		expect(mocks.read).toHaveBeenCalledWith("app", "/log", 10, 4096, "remote");
	});

	it.each([
		{ lines: 0 },
		{ lines: 5001 },
		{ lines: 1.5 },
		{ maxBytes: 0 },
		{ maxBytes: 524289 },
		{ path: "relative" },
		{ path: "/bad\0path" },
		{ containerId: "--bad" },
	])("rejects invalid input %j before reading", async (overrides) => {
		await expect(
			caller().readContainerFileTail({
				containerId: "app",
				path: "/log",
				...overrides,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.read).not.toHaveBeenCalled();
	});

	it.each([
		["READ_TIMEOUT", "TIMEOUT"],
		["CONTAINER_UNAVAILABLE", "NOT_FOUND"],
		["UTILITY_UNAVAILABLE", "PRECONDITION_FAILED"],
		["READ_FAILED", "BAD_REQUEST"],
	] as const)("maps %s to a structured API error", async (code, apiCode) => {
		mocks.read.mockRejectedValue(
			new ContainerFileTailError(code, "read failure"),
		);
		await expect(
			caller().readContainerFileTail({ containerId: "app", path: "/log" }),
		).rejects.toMatchObject({ code: apiCode, message: "read failure" });
	});
});
