import { beforeEach, describe, expect, it, vi } from "vitest";

const CERTIFICATES_PATH = "/etc/dokploy/traefik/dynamic/certificates";

const mocks = vi.hoisted(() => ({
	findCertificateRow: vi.fn(),
	insertReturning: vi.fn(),
	deleteWhere: vi.fn(),
	removeDirectoryIfExistsContent: vi.fn(),
	execAsyncRemote: vi.fn(),
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
	writeFileSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
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
const { createCertificate, removeCertificateById } = await import(
	"@dokploy/server/services/certificate"
);

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
	});
});
