import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * createRedirect writes the Traefik middleware inside the insert transaction.
 * When the remote server is offline (SSH handshake timeout, EHOSTUNREACH) the
 * transaction must fail so the insert is rolled back and the caller sees the
 * error, instead of the redirect existing without its middleware.
 */

const mocks = vi.hoisted(() => ({
	createRedirectMiddleware: vi.fn(),
	findApplicationById: vi.fn(),
	transaction: vi.fn(),
}));

const redirectRow = vi.hoisted(() => ({
	redirectId: "redirect-1",
	applicationId: "app-1",
	regex: "^http://(.*)",
	replacement: "https://$1",
	permanent: true,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		transaction: mocks.transaction,
		query: {},
	},
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: mocks.findApplicationById,
}));

vi.mock("@dokploy/server/utils/traefik/redirect", () => ({
	createRedirectMiddleware: mocks.createRedirectMiddleware,
	removeRedirectMiddleware: vi.fn(),
	updateRedirectMiddleware: vi.fn(),
}));

import { createRedirect } from "@dokploy/server/services/redirect";
import { ExecError } from "@dokploy/server/utils/process/ExecError";

const sshTimeout = () =>
	new ExecError("SSH connection error: Timed out while waiting for handshake", {
		command: "echo traefik",
		serverId: "srv-1",
	});

beforeEach(() => {
	vi.clearAllMocks();
	const tx = {
		insert: () => ({
			values: () => ({ returning: () => Promise.resolve([redirectRow]) }),
		}),
	};
	// Like drizzle: a throwing callback rejects the transaction (and rolls back).
	mocks.transaction.mockImplementation(
		async (callback: (tx: unknown) => Promise<void>) => callback(tx),
	);
	mocks.findApplicationById.mockResolvedValue({
		applicationId: "app-1",
		serverId: "srv-1",
	});
});

describe("createRedirect on a remote server", () => {
	it("fails the transaction when the middleware cannot be written", async () => {
		mocks.createRedirectMiddleware.mockRejectedValue(sshTimeout());

		const result = createRedirect({ applicationId: "app-1" } as never);

		await expect(result).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Error creating this redirect",
			cause: expect.objectContaining({
				message: expect.stringContaining(
					"Timed out while waiting for handshake",
				),
			}),
		});
		expect(mocks.createRedirectMiddleware).toHaveBeenCalledTimes(1);
	});

	it("resolves once the middleware is written", async () => {
		mocks.createRedirectMiddleware.mockResolvedValue(undefined);

		await expect(
			createRedirect({ applicationId: "app-1" } as never),
		).resolves.toBe(true);
	});
});
