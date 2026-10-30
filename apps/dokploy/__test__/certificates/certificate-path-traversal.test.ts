import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasOpenSsl, issueCertificate } from "../caddy/certificate";

const CERTIFICATES_PATH = "/etc/dokploy/traefik/dynamic/certificates";

const mocks = vi.hoisted(() => ({
	applyCaddy: vi.fn(),
	getWebServerProvider: vi.fn(async () => "traefik"),
	syncCaddy: vi.fn(),
	syncCaddyInBackground: vi.fn(),
	findCertificateRow: vi.fn(),
	insertReturning: vi.fn(),
	updateReturning: vi.fn(),
	deleteWhere: vi.fn(),
	removeDirectoryIfExistsContent: vi.fn(),
	execAsyncRemote: vi.fn(),
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
	writeFileSync: vi.fn(),
}));

vi.mock("@dokploy/server/utils/caddy/sync", () => ({
	applyCaddy: mocks.applyCaddy,
	withCaddyQueue: (
		_serverId: string | null | undefined,
		task: () => Promise<unknown>,
	) => task(),
	syncCaddy: mocks.syncCaddy,
	syncCaddyInBackground: mocks.syncCaddyInBackground,
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerProvider: mocks.getWebServerProvider,
}));

vi.mock("node:fs", async (original) => ({
	...(await original<typeof import("node:fs")>()),
	default: {
		existsSync: mocks.existsSync,
		mkdirSync: mocks.mkdirSync,
		writeFileSync: mocks.writeFileSync,
	},
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: { certificates: { findFirst: mocks.findCertificateRow } },
		insert: () => ({
			values: () => ({ returning: mocks.insertReturning }),
		}),
		update: () => ({
			set: () => ({ where: () => ({ returning: mocks.updateReturning }) }),
		}),
		delete: () => ({
			where: () => ({ returning: mocks.deleteWhere }),
		}),
	},
}));

vi.mock("@dokploy/server/constants", () => ({
	paths: () => ({ CERTIFICATES_PATH }),
}));

vi.mock("@dokploy/server/utils/filesystem/directory", () => ({
	removeDirectoryIfExistsContent: mocks.removeDirectoryIfExistsContent,
}));

vi.mock("@dokploy/server/utils/docker/utils", () => ({
	encodeBase64: (value: string) => Buffer.from(value).toString("base64"),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsyncRemote: mocks.execAsyncRemote,
}));

const { apiCreateCertificate } = await import("@dokploy/server/db/schema");
const { createCertificate, removeCertificateById, updateCertificate } =
	await import("@dokploy/server/services/certificate");

const certificate = {
	certificateId: "cert-1",
	name: "example",
	certificateData: "CERT",
	privateKey: "KEY",
	organizationId: "org-a",
	serverId: null,
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getWebServerProvider.mockResolvedValue("traefik");
	mocks.applyCaddy.mockResolvedValue(undefined);
	mocks.existsSync.mockReturnValue(false);
	mocks.deleteWhere.mockResolvedValue([certificate]);
});

describe("certificate create input", () => {
	it("ignores a client-supplied certificatePath", () => {
		const parsed = apiCreateCertificate.parse({
			name: "example",
			certificateData: "CERT",
			privateKey: "KEY",
			organizationId: "org-a",
			certificatePath: "../../../../tmp/escape",
		});

		expect(parsed).not.toHaveProperty("certificatePath");
	});
});

describe("certificate files stay inside CERTIFICATES_PATH", () => {
	it("keeps the Traefik row retryable when file deletion fails", async () => {
		mocks.findCertificateRow.mockResolvedValue({
			...certificate,
			serverId: "server-1",
			certificatePath: "certificate-abc123",
		});
		mocks.execAsyncRemote.mockRejectedValueOnce(new Error("SSH unavailable"));
		await expect(removeCertificateById("cert-1")).rejects.toThrow(
			"SSH unavailable",
		);
		expect(mocks.deleteWhere).not.toHaveBeenCalled();
	});
	it.each(["../../../../tmp/escape", "/tmp/escape", "", "."])(
		"refuses to delete the directory resolved from %j",
		async (certificatePath) => {
			mocks.findCertificateRow.mockResolvedValue({
				...certificate,
				certificatePath,
			});

			await expect(removeCertificateById("cert-1")).rejects.toMatchObject({
				code: "BAD_REQUEST",
			});
			expect(mocks.removeDirectoryIfExistsContent).not.toHaveBeenCalled();
			expect(mocks.deleteWhere).not.toHaveBeenCalled();
		},
	);

	it("refuses to delete an escaping directory on a remote server", async () => {
		mocks.findCertificateRow.mockResolvedValue({
			...certificate,
			serverId: "server-1",
			certificatePath: "../../../../tmp/escape",
		});

		await expect(removeCertificateById("cert-1")).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("deletes a directory inside CERTIFICATES_PATH", async () => {
		mocks.findCertificateRow.mockResolvedValue({
			...certificate,
			certificatePath: "certificate-abc123",
		});

		await removeCertificateById("cert-1");

		expect(mocks.removeDirectoryIfExistsContent).toHaveBeenCalledWith(
			`${CERTIFICATES_PATH}/certificate-abc123`,
		);
	});

	it("keeps certificate files if Caddy refuses to stop referencing them", async () => {
		mocks.getWebServerProvider.mockResolvedValue("caddy");
		mocks.findCertificateRow.mockResolvedValue({
			...certificate,
			certificatePath: "certificate-abc123",
		});
		mocks.applyCaddy.mockRejectedValueOnce(new Error("reload rejected"));
		await expect(removeCertificateById("cert-1")).rejects.toThrow(
			"reload rejected",
		);
		expect(mocks.deleteWhere).toHaveBeenCalled();
		expect(mocks.applyCaddy).toHaveBeenCalledWith(null, true);
		expect(mocks.removeDirectoryIfExistsContent).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("removes the files only after Caddy accepts the deletion", async () => {
		mocks.getWebServerProvider.mockResolvedValue("caddy");
		mocks.findCertificateRow.mockResolvedValue({
			...certificate,
			certificatePath: "certificate-abc123",
		});
		await removeCertificateById("cert-1");
		expect(mocks.deleteWhere.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.applyCaddy.mock.invocationCallOrder[0]!,
		);
		expect(mocks.applyCaddy.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.removeDirectoryIfExistsContent.mock.invocationCallOrder[0]!,
		);
	});

	it("refuses to write certificate files outside CERTIFICATES_PATH", async () => {
		mocks.insertReturning.mockResolvedValue([
			{ ...certificate, certificatePath: "../../../../tmp/escape" },
		]);

		await expect(
			createCertificate(
				{
					name: "example",
					certificateData: "CERT",
					privateKey: "KEY",
					organizationId: "org-a",
				},
				"org-a",
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.mkdirSync).not.toHaveBeenCalled();
		expect(mocks.writeFileSync).not.toHaveBeenCalled();
		expect(mocks.syncCaddyInBackground).not.toHaveBeenCalled();
	});

	it("writes certificate files inside CERTIFICATES_PATH", async () => {
		mocks.insertReturning.mockResolvedValue([
			{ ...certificate, certificatePath: "certificate-abc123" },
		]);

		await createCertificate(
			{
				name: "example",
				certificateData: "CERT",
				privateKey: "KEY",
				organizationId: "org-a",
			},
			"org-a",
		);

		expect(mocks.mkdirSync).toHaveBeenCalledWith(
			`${CERTIFICATES_PATH}/certificate-abc123`,
			{ recursive: true },
		);
		expect(mocks.syncCaddyInBackground).toHaveBeenCalledWith(null);
		expect(mocks.writeFileSync.mock.invocationCallOrder.at(-1)).toBeLessThan(
			mocks.syncCaddyInBackground.mock.invocationCallOrder[0]!,
		);
	});
});

describe.skipIf(!hasOpenSsl())(
	"Caddy certificate validation before persistence",
	() => {
		const pair = issueCertificate(["valid.test"]);
		const other = issueCertificate(["other.test"]);
		const input = {
			...certificate,
			certificateData: pair.certificate,
			privateKey: pair.key,
			certificatePath: "certificate-abc123",
		};
		beforeEach(() => {
			mocks.getWebServerProvider.mockResolvedValue("caddy");
			mocks.findCertificateRow.mockResolvedValue(input);
			mocks.insertReturning.mockResolvedValue([input]);
			mocks.updateReturning.mockResolvedValue([input]);
		});
		it("accepts a matching pair", async () => {
			await createCertificate(input, "org-a");
			expect(mocks.insertReturning).toHaveBeenCalledOnce();
			expect(mocks.writeFileSync).toHaveBeenCalled();
		});
		it.each(["not a key", other.key])(
			"rejects invalid or mismatched keys before create",
			async (privateKey) => {
				await expect(
					createCertificate({ ...input, privateKey }, "org-a"),
				).rejects.toMatchObject({ code: "BAD_REQUEST" });
				expect(mocks.insertReturning).not.toHaveBeenCalled();
				expect(mocks.writeFileSync).not.toHaveBeenCalled();
			},
		);
		it.each([
			{ privateKey: other.key },
			{ certificateData: "invalid" },
			{ privateKey: "" },
		])(
			"rejects a partial update that breaks the saved pair",
			async (updates) => {
				await expect(
					updateCertificate("cert-1", updates),
				).rejects.toMatchObject({ code: "BAD_REQUEST" });
				expect(mocks.updateReturning).not.toHaveBeenCalled();
				expect(mocks.writeFileSync).not.toHaveBeenCalled();
				expect(mocks.syncCaddy).not.toHaveBeenCalled();
			},
		);
		it("validates a partial update against the unchanged key", async () => {
			await updateCertificate("cert-1", { certificateData: pair.certificate });
			expect(mocks.updateReturning).toHaveBeenCalledOnce();
			expect(mocks.syncCaddy).toHaveBeenCalledWith(null, true);
		});
	},
);
