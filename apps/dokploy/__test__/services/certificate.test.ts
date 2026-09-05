import fs from "node:fs";
import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB so createCertificate/updateCertificate/removeCertificateById run
// against controlled data. A local vi.mock wins over the global one in setup.ts.
const mocks = vi.hoisted(() => ({
	insertReturning: vi.fn(),
	deleteReturning: vi.fn(),
	findFirst: vi.fn(),
	execAsyncRemote: vi.fn(),
	removeDir: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		insert: vi.fn(() => ({
			values: vi.fn(() => ({ returning: mocks.insertReturning })),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(() => ({ returning: mocks.deleteReturning })),
			})),
		})),
		delete: vi.fn(() => ({
			where: vi.fn(() => ({ returning: mocks.deleteReturning })),
		})),
		query: {
			certificates: { findFirst: mocks.findFirst },
		},
	},
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsyncRemote: mocks.execAsyncRemote,
	execAsync: vi.fn(),
	ExecError: class ExecError extends Error {},
}));

vi.mock("@dokploy/server/utils/filesystem/directory", () => ({
	removeDirectoryIfExistsContent: mocks.removeDir,
}));

import { createCertificate } from "@dokploy/server/services/certificate";

const ORG = "org-1";

const certRowLocal = {
	certificateId: "cert-local",
	name: "local-cert",
	certificateData:
		"-----BEGIN CERTIFICATE-----\nDATA\n-----END CERTIFICATE-----",
	privateKey: "-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----",
	certificatePath: "local-cert-path",
	autoRenew: null,
	organizationId: ORG,
	serverId: null,
};

const certRowRemote = {
	...certRowLocal,
	certificateId: "cert-remote",
	certificatePath: "remote-cert-path",
	serverId: "server-1",
};

const baseInput = {
	name: "local-cert",
	certificateData: certRowLocal.certificateData,
	privateKey: certRowLocal.privateKey,
	organizationId: ORG,
};

beforeEach(() => {
	vi.clearAllMocks();
	// The local branch of createCertificateFiles calls fs.existsSync/mkdirSync/
	// writeFileSync synchronously. Spy on the real fs so we can observe the
	// writes and inject failures without touching disk. These spies are
	// installed after module-load-time fs usage has already run.
	vi.spyOn(fs, "existsSync").mockReturnValue(false);
	vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined);
	vi.spyOn(fs, "writeFileSync").mockReturnValue(undefined);

	mocks.insertReturning.mockResolvedValue([certRowLocal]);
	mocks.findFirst.mockResolvedValue(certRowLocal);
	mocks.deleteReturning.mockResolvedValue([certRowLocal]);
	mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.removeDir.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("createCertificate", () => {
	it("writes the certificate files (local path) and returns the created row", async () => {
		const cert = await createCertificate(baseInput, ORG);

		expect(cert).toEqual(certRowLocal);
		expect(fs.mkdirSync).toHaveBeenCalled();
		expect(fs.writeFileSync).toHaveBeenCalledTimes(3);
		const writePaths = vi.mocked(fs.writeFileSync).mock.calls.map((c) => c[0]);
		expect(writePaths).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/chain\.crt$/),
				expect.stringMatching(/privkey\.key$/),
				expect.stringMatching(/certificate\.yml$/),
			]),
		);
		// No rollback on success.
		expect(mocks.removeDir).not.toHaveBeenCalled();
		expect(mocks.deleteReturning).not.toHaveBeenCalled();
		expect(mocks.findFirst).not.toHaveBeenCalled();
	});

	it("rolls back the DB row and throws when a local file write fails", async () => {
		vi.spyOn(fs, "writeFileSync").mockImplementation(() => {
			const err: NodeJS.ErrnoException = new Error(
				"ENOSPC: no space left on device",
			);
			err.code = "ENOSPC";
			throw err;
		});

		await expect(createCertificate(baseInput, ORG)).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Failed to write certificate files",
		});

		// Rollback removed the on-disk dir (local helper) and deleted the row.
		expect(mocks.removeDir).toHaveBeenCalledOnce();
		expect(mocks.removeDir.mock.calls[0]?.[0]).toMatch(/local-cert-path$/);
		expect(mocks.deleteReturning).toHaveBeenCalledOnce();
		expect(mocks.findFirst).toHaveBeenCalledOnce();
	});

	it("rolls back via SSH and throws when a remote write fails", async () => {
		mocks.insertReturning.mockResolvedValue([certRowRemote]);
		mocks.findFirst.mockResolvedValue(certRowRemote);
		mocks.execAsyncRemote
			.mockRejectedValueOnce(new Error("SSH auth failed"))
			.mockResolvedValueOnce({ stdout: "", stderr: "" });

		await expect(
			createCertificate({ ...baseInput, serverId: "server-1" }, ORG),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Failed to write certificate files",
		});

		// Two SSH calls: the failed write, then the `rm -rf` rollback.
		expect(mocks.execAsyncRemote).toHaveBeenCalledTimes(2);
		expect(mocks.execAsyncRemote.mock.calls[1]?.[0]).toBe("server-1");
		expect(mocks.execAsyncRemote.mock.calls[1]?.[1]).toMatch(/^rm -rf /);
		expect(mocks.deleteReturning).toHaveBeenCalledOnce();
	});

	it("still surfaces a TRPCError when the rollback SSH call also fails (best-effort rollback)", async () => {
		mocks.insertReturning.mockResolvedValue([certRowRemote]);
		mocks.findFirst.mockResolvedValue(certRowRemote);
		// Both the write and the rollback `rm -rf` fail.
		mocks.execAsyncRemote.mockRejectedValue(new Error("host unreachable"));

		const err = await createCertificate(
			{ ...baseInput, serverId: "server-1" },
			ORG,
		).catch((e) => e);

		expect(err).toBeInstanceOf(TRPCError);
		expect(err).toMatchObject({
			code: "BAD_REQUEST",
			message: "Failed to write certificate files",
		});
		// Rollback attempted the `rm -rf` (second call) but it rejected, so the
		// db.delete never ran. The original failure still surfaces as a TRPCError.
		expect(mocks.execAsyncRemote).toHaveBeenCalledTimes(2);
		expect(mocks.deleteReturning).not.toHaveBeenCalled();
	});

	it("does not resolve until the remote SSH write completes (no response-before-write race)", async () => {
		mocks.insertReturning.mockResolvedValue([certRowRemote]);
		let resolveWrite!: (v: { stdout: string; stderr: string }) => void;
		const inFlight = new Promise<{ stdout: string; stderr: string }>((r) => {
			resolveWrite = r;
		});
		mocks.execAsyncRemote.mockReturnValueOnce(inFlight);

		let resolved = false;
		const promise = createCertificate(
			{ ...baseInput, serverId: "server-1" },
			ORG,
		).then(() => {
			resolved = true;
		});

		// Drain microtasks. The SSH write is still in flight, so
		// createCertificate must NOT have resolved (regression guard for the
		// previously-un-awaited async helper).
		await Promise.resolve();
		await Promise.resolve();
		expect(resolved).toBe(false);
		expect(mocks.execAsyncRemote).toHaveBeenCalledOnce();

		resolveWrite({ stdout: "", stderr: "" });
		await promise;
		expect(resolved).toBe(true);
	});
});
