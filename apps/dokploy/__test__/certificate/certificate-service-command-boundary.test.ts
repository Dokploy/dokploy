import { beforeEach, describe, expect, it, vi } from "vitest";

const createReturningChain = (result: unknown) => ({
	values: vi.fn(() => ({
		returning: vi.fn(async () => result),
	})),
});

const deleteReturningChain = (result: unknown) => ({
	where: vi.fn(() => ({
		returning: vi.fn(async () => result),
	})),
});

const mocks = vi.hoisted(() => ({
	certificateFindFirst: vi.fn(),
	dbDelete: vi.fn(),
	dbInsert: vi.fn(),
	execAsyncRemote: vi.fn(),
	paths: vi.fn(),
}));

vi.mock("@dokploy/server/constants", () => ({
	paths: mocks.paths,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		delete: mocks.dbDelete,
		insert: mocks.dbInsert,
		query: {
			certificates: {
				findFirst: mocks.certificateFindFirst,
			},
		},
	},
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsyncRemote: mocks.execAsyncRemote,
}));

const { createCertificate, removeCertificateById } = await import(
	"@dokploy/server/services/certificate"
);

const certificate = {
	autoRenew: false,
	certificateData:
		"-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----",
	certificateId: "certificate-1",
	certificatePath: "cert-one",
	name: "certificate",
	organizationId: "org-1",
	privateKey: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
	serverId: "server-1",
};

describe("certificate service command boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
		mocks.paths.mockReturnValue({
			CERTIFICATES_PATH: "/srv/dokploy/traefik/dynamic/certificates",
		});
		mocks.dbInsert.mockReturnValue(createReturningChain([certificate]));
		mocks.dbDelete.mockReturnValue(deleteReturningChain([certificate]));
		mocks.certificateFindFirst.mockResolvedValue(certificate);
	});

	it("rejects unsafe stored certificate paths before remote file commands", async () => {
		mocks.dbInsert.mockReturnValue(
			createReturningChain([
				{
					...certificate,
					certificatePath: "cert;id",
				},
			]),
		);

		await expect(
			createCertificate(
				{
					autoRenew: false,
					certificateData: certificate.certificateData,
					organizationId: "org-1",
					privateKey: certificate.privateKey,
					name: "certificate",
					serverId: "server-1",
				},
				"org-1",
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("rejects dot-segment certificate paths before persistence", async () => {
		await expect(
			createCertificate(
				{
					autoRenew: false,
					certificateData: certificate.certificateData,
					certificatePath: "..",
					organizationId: "org-1",
					privateKey: certificate.privateKey,
					name: "certificate",
					serverId: "server-1",
				},
				"org-1",
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		expect(mocks.dbInsert).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("rejects unsafe stored certificate paths before removal commands", async () => {
		mocks.certificateFindFirst.mockResolvedValue({
			...certificate,
			certificatePath: ".",
		});

		await expect(removeCertificateById("certificate-1")).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});

		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.dbDelete).not.toHaveBeenCalled();
	});

	it("quotes remote certificate file paths and content writes", async () => {
		await expect(
			createCertificate(
				{
					autoRenew: false,
					certificateData: certificate.certificateData,
					organizationId: "org-1",
					privateKey: certificate.privateKey,
					name: "certificate",
					serverId: "server-1",
				},
				"org-1",
			),
		).resolves.toMatchObject({ certificateId: "certificate-1" });

		const command = mocks.execAsyncRemote.mock.calls[0]?.[1] as string;
		expect(command).toContain(
			"mkdir -p /srv/dokploy/traefik/dynamic/certificates/cert-one",
		);
		expect(command).toContain("printf %s");
		expect(command).toContain("base64 -d >");
		expect(command).toContain("/chain.crt");
		expect(command).toContain("/privkey.key");
		expect(command).toContain("/certificate.yml");
		expect(command).not.toContain('echo "');
	});

	it("quotes remote certificate removal paths", async () => {
		await expect(removeCertificateById("certificate-1")).resolves.toEqual([
			certificate,
		]);

		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"server-1",
			"rm -rf -- /srv/dokploy/traefik/dynamic/certificates/cert-one",
		);
	});
});
