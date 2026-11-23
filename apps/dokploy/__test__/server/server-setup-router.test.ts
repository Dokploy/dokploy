import { TRPCError } from "@trpc/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findServerById: vi.fn(async () => ({
		organizationId: "org-a",
		name: "test",
	})),
	serverSetup: vi.fn(),
}));
vi.mock("@dokploy/server", () => mocks);
vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn(async () => undefined),
}));
vi.mock("@dokploy/server/lib/auth", () => ({ validateRequest: vi.fn() }));
vi.mock("@/pages/api/stripe/webhook", () => ({
	updateServersBasedOnQuantity: vi.fn(),
}));
vi.mock("@/server/api/utils/audit", () => ({ audit: vi.fn() }));
vi.mock("@/server/utils/docker-cleanup", () => ({
	applyDockerCleanupSchedule: vi.fn(),
}));

const { serverRouter } = await import("@/server/api/routers/server");
const caller = serverRouter.createCaller({
	session: { activeOrganizationId: "org-a" },
	user: { id: "user-1", email: "user@example.com", role: "owner" },
} as Parameters<typeof serverRouter.createCaller>[0]);

beforeEach(() => {
	vi.clearAllMocks();
	mocks.serverSetup.mockRejectedValue(
		new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Switch to Traefik before setup",
		}),
	);
});

it("propagates the setup precondition to the mutation caller", async () => {
	await expect(caller.setup({ serverId: "server-a" })).rejects.toMatchObject({
		code: "PRECONDITION_FAILED",
	});
});

it("delivers a rejected setup through the log stream instead of leaving an unhandled rejection", async () => {
	const stream = await caller.setupWithLogs({ serverId: "server-a" });
	const error = vi.fn();
	const subscription = stream.subscribe({ error });
	await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());
	expect(error).toHaveBeenCalledWith(
		expect.objectContaining({ code: "PRECONDITION_FAILED" }),
	);
	subscription.unsubscribe();
});
