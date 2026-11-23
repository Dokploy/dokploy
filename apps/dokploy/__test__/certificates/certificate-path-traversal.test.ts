import { beforeEach, describe, expect, it, vi } from "vitest";

const DYNAMIC_TRAEFIK_PATH = "/etc/dokploy/traefik/dynamic";
const CERTIFICATES_PATH = `${DYNAMIC_TRAEFIK_PATH}/certificates`;
const REMOTE_RELOAD = `{ touch -c -- ${DYNAMIC_TRAEFIK_PATH} || true; }`;

const mocks = vi.hoisted(() => ({
	findCertificateRow: vi.fn(),
	insertReturning: vi.fn(),
	deleteWhere: vi.fn(),
	removeDirectoryIfExistsContent: vi.fn(),
	execAsyncRemote: vi.fn(),
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
	writeFileSync: vi.fn(),
	reloadTraefikDynamicConfig: vi.fn(),
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
	paths: () => ({ CERTIFICATES_PATH, DYNAMIC_TRAEFIK_PATH }),
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

vi.mock("@dokploy/server/utils/traefik/reload", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/utils/traefik/reload")
	>()),
	reloadTraefikDynamicConfig: mocks.reloadTraefikDynamicConfig,
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
			expect(mocks.reloadTraefikDynamicConfig).not.toHaveBeenCalled();
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
		expect(mocks.reloadTraefikDynamicConfig).toHaveBeenCalledTimes(1);
		expect(
			mocks.removeDirectoryIfExistsContent.mock.invocationCallOrder[0],
		).toBeLessThan(
			mocks.reloadTraefikDynamicConfig.mock.invocationCallOrder[0]!,
		);
	});

	it("reloads Traefik in the same remote command, only if the delete succeeded", async () => {
		mocks.findCertificateRow.mockResolvedValue({
			...certificate,
			serverId: "server-1",
			certificatePath: "certificate-abc123",
		});

		await removeCertificateById("cert-1");

		expect(mocks.execAsyncRemote).toHaveBeenCalledTimes(1);
		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"server-1",
			`rm -rf ${CERTIFICATES_PATH}/certificate-abc123 && ${REMOTE_RELOAD}`,
		);
		expect(mocks.reloadTraefikDynamicConfig).not.toHaveBeenCalled();
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
		expect(mocks.reloadTraefikDynamicConfig).not.toHaveBeenCalled();
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
		expect(mocks.reloadTraefikDynamicConfig).toHaveBeenCalledTimes(1);
		const lastWrite = Math.max(...mocks.writeFileSync.mock.invocationCallOrder);
		expect(lastWrite).toBeLessThan(
			mocks.reloadTraefikDynamicConfig.mock.invocationCallOrder[0]!,
		);
	});

	it("writes remote certificate files and reloads Traefik in one command that stops at the first failure", async () => {
		mocks.insertReturning.mockResolvedValue([
			{
				...certificate,
				serverId: "server-1",
				certificatePath: "certificate-abc123",
			},
		]);

		await createCertificate(
			{
				name: "example",
				certificateData: "CERT",
				privateKey: "KEY",
				organizationId: "org-a",
				serverId: "server-1",
			},
			"org-a",
		);

		expect(mocks.execAsyncRemote).toHaveBeenCalledTimes(1);
		const [serverId, command] = mocks.execAsyncRemote.mock.calls[0]!;
		const dir = `${CERTIFICATES_PATH}/certificate-abc123`;
		expect(serverId).toBe("server-1");
		expect(command.split(" && ")).toEqual([
			`mkdir -p ${dir}`,
			`echo "${Buffer.from("CERT").toString("base64")}" | base64 -d > ${dir}/chain.crt`,
			`echo "${Buffer.from("KEY").toString("base64")}" | base64 -d > ${dir}/privkey.key`,
			expect.stringMatching(
				new RegExp(`^echo "tls:[\\s\\S]*" > ${dir}/certificate\\.yml$`),
			),
			REMOTE_RELOAD,
		]);
		expect(mocks.reloadTraefikDynamicConfig).not.toHaveBeenCalled();
	});
});
