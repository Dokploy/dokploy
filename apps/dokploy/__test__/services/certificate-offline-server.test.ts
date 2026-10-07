import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * createCertificate is a request path: when the certificate files cannot be
 * written to the remote server (offline: SSH handshake timeout, EHOSTUNREACH)
 * the mutation must fail, and must not leave a certificate row behind whose
 * files were never written.
 */

const mocks = vi.hoisted(() => ({
	execAsyncRemote: vi.fn(),
	deleteWhere: vi.fn(),
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
		delete: () => ({ where: mocks.deleteWhere }),
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

import { createCertificate } from "@dokploy/server/services/certificate";
import { ExecError } from "@dokploy/server/utils/process/ExecError";

const sshTimeout = () =>
	new ExecError("SSH connection error: Timed out while waiting for handshake", {
		command: "mkdir -p /etc/dokploy",
		serverId: "srv-1",
	});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.deleteWhere.mockReturnValue(Promise.resolve([]));
});

describe("createCertificate on a remote server", () => {
	it("rejects and removes the just-inserted row when the server is offline", async () => {
		mocks.execAsyncRemote.mockRejectedValue(sshTimeout());

		await expect(
			createCertificate({ name: "wildcard" } as never, "org-1"),
		).rejects.toThrow("Timed out while waiting for handshake");

		expect(mocks.execAsyncRemote).toHaveBeenCalledTimes(1);
		expect(mocks.deleteWhere).toHaveBeenCalledTimes(1);
	});

	it("still rethrows the original error when the cleanup delete fails too", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		mocks.execAsyncRemote.mockRejectedValue(sshTimeout());
		mocks.deleteWhere.mockReturnValue(Promise.reject(new Error("db down")));

		await expect(
			createCertificate({ name: "wildcard" } as never, "org-1"),
		).rejects.toThrow("Timed out while waiting for handshake");

		expect(errorSpy).toHaveBeenCalledWith(
			"Failed to roll back certificate",
			expect.objectContaining({ certificateId: "cert-1" }),
		);
		errorSpy.mockRestore();
	});

	it("keeps the row and returns it when the files are written", async () => {
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });

		const created = await createCertificate(
			{ name: "wildcard" } as never,
			"org-1",
		);

		expect(created.certificateId).toBe("cert-1");
		expect(mocks.deleteWhere).not.toHaveBeenCalled();
	});
});
