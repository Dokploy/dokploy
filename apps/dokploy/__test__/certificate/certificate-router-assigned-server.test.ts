import { REDACTED_SECRET_VALUE } from "@dokploy/server/utils/security/redaction";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	certificateFindMany: vi.fn(),
	checkPermission: vi.fn(),
	createCertificate: vi.fn(),
	findCertificateById: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	removeCertificateById: vi.fn(),
	updateCertificate: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: true,
	createCertificate: mocks.createCertificate,
	findCertificateById: mocks.findCertificateById,
	getAccessibleServerIds: mocks.getAccessibleServerIds,
	removeCertificateById: mocks.removeCertificateById,
	updateCertificate: mocks.updateCertificate,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			certificates: {
				findMany: mocks.certificateFindMany,
			},
		},
	},
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: mocks.audit,
}));

const { certificateRouter } = await import(
	"../../server/api/routers/certificate"
);

const certificateInput = {
	name: "certificate",
	certificateData:
		"-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----",
	privateKey: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
	autoRenew: false,
	organizationId: "org-1",
	serverId: "server-1",
};

const createCaller = () =>
	certificateRouter.createCaller({
		db: {},
		req: {},
		res: {},
		session: {
			userId: "user-1",
			activeOrganizationId: "org-1",
		},
		user: {
			id: "user-1",
			role: "member",
		},
	} as never);

describe("certificate router assigned-server boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.createCertificate.mockResolvedValue({
			certificateId: "certificate-1",
			name: "certificate",
			serverId: "server-1",
		});
		mocks.certificateFindMany.mockResolvedValue([
			{
				certificateId: "certificate-1",
				name: "accessible",
				certificateData: "certificate-data",
				privateKey: "private-key",
				organizationId: "org-1",
				serverId: "server-1",
			},
			{
				certificateId: "certificate-2",
				name: "inaccessible",
				certificateData: "certificate-data",
				privateKey: "private-key",
				organizationId: "org-1",
				serverId: "server-2",
			},
			{
				certificateId: "certificate-local",
				name: "local",
				certificateData: "certificate-data",
				privateKey: "private-key",
				organizationId: "org-1",
				serverId: null,
			},
		]);
		mocks.findCertificateById.mockResolvedValue({
			certificateId: "certificate-1",
			name: "certificate",
			certificateData: "certificate-data",
			privateKey: "private-key",
			organizationId: "org-1",
			serverId: "server-1",
		});
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));
		mocks.removeCertificateById.mockResolvedValue(true);
		mocks.updateCertificate.mockResolvedValue({
			certificateId: "certificate-1",
			name: "updated",
			certificateData: "certificate-data",
			privateKey: "private-key",
			organizationId: "org-1",
			serverId: "server-1",
		});
	});

	it("redacts certificate private keys from one and all", async () => {
		await expect(
			createCaller().one({ certificateId: "certificate-1" }),
		).resolves.toMatchObject({
			certificateData: "certificate-data",
			privateKey: REDACTED_SECRET_VALUE,
		});

		const results = await createCaller().all();
		expect(results).toEqual([
			expect.objectContaining({
				certificateId: "certificate-1",
				privateKey: REDACTED_SECRET_VALUE,
			}),
			expect.objectContaining({
				certificateId: "certificate-local",
				privateKey: REDACTED_SECRET_VALUE,
			}),
		]);
	});

	it("preserves stored certificate private keys when update receives the redacted placeholder", async () => {
		const result = await createCaller().update({
			certificateId: "certificate-1",
			name: "updated",
			privateKey: REDACTED_SECRET_VALUE,
		});

		expect(mocks.updateCertificate.mock.calls[0]?.[1]).not.toHaveProperty(
			"privateKey",
		);
		expect(result.privateKey).toBe(REDACTED_SECRET_VALUE);
	});

	it("denies cloud certificate creation on inaccessible servers before file writes", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(createCaller().create(certificateInput)).rejects.toMatchObject(
			{ code: "UNAUTHORIZED" },
		);

		expect(mocks.createCertificate).not.toHaveBeenCalled();
	});

	it("rejects unsafe certificate paths before file writes", async () => {
		for (const certificatePath of ["cert;id", ".", ".."]) {
			await expect(
				createCaller().create({
					...certificateInput,
					certificatePath,
				}),
			).rejects.toThrow();
		}

		expect(mocks.createCertificate).not.toHaveBeenCalled();
	});

	it("allows cloud certificate creation on accessible servers", async () => {
		await expect(
			createCaller().create(certificateInput),
		).resolves.toMatchObject({
			certificateId: "certificate-1",
		});

		expect(mocks.createCertificate).toHaveBeenCalledWith(
			certificateInput,
			"org-1",
		);
	});

	it("denies certificate removal on inaccessible servers before file deletion", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().remove({ certificateId: "certificate-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.removeCertificateById).not.toHaveBeenCalled();
	});

	it("denies certificate updates on inaccessible servers", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().update({
				certificateId: "certificate-1",
				name: "updated",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.updateCertificate).not.toHaveBeenCalled();
	});

	it("filters certificate lists to accessible or local certificates", async () => {
		await expect(createCaller().all()).resolves.toEqual([
			expect.objectContaining({ certificateId: "certificate-1" }),
			expect.objectContaining({ certificateId: "certificate-local" }),
		]);
	});
});
