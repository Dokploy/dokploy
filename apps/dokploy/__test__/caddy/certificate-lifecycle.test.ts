import { beforeEach, expect, test, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
	query: {
		certificates: { findFirst: vi.fn() },
		domains: { findFirst: vi.fn() },
	},
	delete: vi.fn(),
	update: vi.fn(),
}));

const resolveWebServerProviderMock = vi.hoisted(() => vi.fn());
const removeDirectoryIfExistsContentMock = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/db", () => ({
	db: dbMock,
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getCaddyCompileSettings: vi.fn().mockResolvedValue({}),
	resolveWebServerProvider: resolveWebServerProviderMock,
}));

vi.mock("@dokploy/server/utils/filesystem/directory", () => ({
	removeDirectoryIfExistsContent: removeDirectoryIfExistsContentMock,
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsyncRemote: vi.fn(),
}));

import {
	removeCertificateById,
	updateCertificate,
} from "@dokploy/server/services/certificate";

const certificate = {
	certificateId: "cert-1",
	name: "Shared cert",
	certificatePath: "certificate-uploaded",
	certificateData: "cert",
	privateKey: "key",
	autoRenew: null,
	organizationId: "org-1",
	serverId: null,
};

beforeEach(() => {
	vi.clearAllMocks();
	dbMock.query.certificates.findFirst.mockResolvedValue(certificate);
	dbMock.query.domains.findFirst.mockResolvedValue(null);
	dbMock.delete.mockReturnValue({
		where: vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([certificate]),
		}),
	});
	dbMock.update.mockReturnValue({
		set: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([certificate]),
			}),
		}),
	});
	resolveWebServerProviderMock.mockResolvedValue("caddy");
	removeDirectoryIfExistsContentMock.mockResolvedValue(undefined);
});

test("blocks deleting uploaded certificates used by active Caddy domains", async () => {
	dbMock.query.domains.findFirst.mockResolvedValueOnce({
		host: "example.com",
	});

	await expect(removeCertificateById("cert-1")).rejects.toThrow(
		'Cannot delete certificate "Shared cert" because active Caddy domain "example.com" uses it',
	);

	expect(removeDirectoryIfExistsContentMock).not.toHaveBeenCalled();
	expect(dbMock.delete).not.toHaveBeenCalled();
});

test("blocks replacing uploaded certificate files used by active Caddy domains", async () => {
	dbMock.query.domains.findFirst.mockResolvedValueOnce({
		host: "example.com",
	});

	await expect(
		updateCertificate("cert-1", { certificateData: "new cert" }),
	).rejects.toThrow(
		'Cannot update certificate "Shared cert" because active Caddy domain "example.com" uses it',
	);

	expect(dbMock.update).not.toHaveBeenCalled();
});
