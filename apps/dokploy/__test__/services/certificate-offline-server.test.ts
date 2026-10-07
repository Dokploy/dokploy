import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * createCertificate writes the certificate files to a remote server after the
 * row is saved, without awaiting. An offline server (SSH handshake timeout,
 * EHOSTUNREACH) used to surface as a context-free `unhandledRejection`.
 */

const mocks = vi.hoisted(() => ({
	execAsyncRemote: vi.fn(),
}));

const certificate = vi.hoisted(() => ({
	certificateId: "cert-1",
	name: "wildcard",
	certificateData: "CERT",
	privateKey: "KEY",
	certificatePath: "wildcard-abc",
	autoRenew: false,
	organizationId: "org-1",
	serverId: "srv-1",
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		insert: () => ({
			values: () => ({ returning: () => Promise.resolve([certificate]) }),
		}),
		query: {},
	},
}));

vi.mock("@dokploy/server/constants", () => ({
	paths: () => ({
		CERTIFICATES_PATH: "/etc/dokploy/traefik/dynamic/certificates",
		DYNAMIC_TRAEFIK_PATH: "/etc/dokploy/traefik/dynamic",
	}),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsyncRemote: mocks.execAsyncRemote,
}));

vi.mock("@dokploy/server/utils/filesystem/directory", () => ({
	removeDirectoryIfExistsContent: vi.fn(),
}));

import { ExecError } from "@dokploy/server/utils/process/ExecError";
import { createCertificate } from "@dokploy/server/services/certificate";

let unhandled: unknown[];
const onUnhandled = (reason: unknown) => {
	unhandled.push(reason);
};
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	unhandled = [];
	process.on("unhandledRejection", onUnhandled);
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	vi.clearAllMocks();
});

afterEach(() => {
	process.off("unhandledRejection", onUnhandled);
	errorSpy.mockRestore();
});

describe("createCertificate on an offline remote server", () => {
	it("returns the saved certificate and logs the failed file write", async () => {
		mocks.execAsyncRemote.mockRejectedValue(
			new ExecError(
				"SSH connection error: Timed out while waiting for handshake",
				{ command: "mkdir -p /etc/dokploy", serverId: "srv-1" },
			),
		);

		const created = await createCertificate(
			{ name: "wildcard" } as never,
			"org-1",
		);
		await new Promise((r) => setTimeout(r, 30));

		expect(created.certificateId).toBe("cert-1");
		expect(mocks.execAsyncRemote).toHaveBeenCalledTimes(1);
		expect(unhandled).toEqual([]);
		expect(errorSpy).toHaveBeenCalledWith(
			"Certificate files failed",
			{ certificateId: "cert-1", serverId: "srv-1" },
			expect.stringContaining("Timed out while waiting for handshake"),
		);
	});
});
