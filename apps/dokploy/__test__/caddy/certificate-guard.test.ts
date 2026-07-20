import { fs, vol } from "memfs";
import { beforeEach, expect, test, vi } from "vitest";

const certificatesFindFirstMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs", () => ({
	...fs,
	default: fs,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			certificates: {
				findFirst: certificatesFindFirstMock,
			},
		},
	},
}));

import type { Domain } from "@dokploy/server";
import { paths } from "@dokploy/server/constants";
import { assertCaddyDomainCertificateAvailable } from "@dokploy/server/utils/caddy/domain";

const writeCertificateFiles = (certificatePath: string) => {
	const certDir = `${paths().CERTIFICATES_PATH}/${certificatePath}`;
	vol.mkdirSync(certDir, { recursive: true });
	vol.writeFileSync(`${certDir}/chain.crt`, "cert");
	vol.writeFileSync(`${certDir}/privkey.key`, "key");
};

const domain = (overrides: Partial<Domain> = {}) =>
	({
		domainId: "domain-1",
		applicationId: "app-1",
		composeId: null,
		previewDeploymentId: null,
		domainType: "application",
		host: "example.com",
		path: "/",
		internalPath: "/",
		stripPath: false,
		https: true,
		certificateType: "custom",
		customCertResolver: "certificate-uploaded",
		customEntrypoint: null,
		middlewares: null,
		port: 3000,
		serviceName: null,
		uniqueConfigKey: 7,
		createdAt: "",
		...overrides,
	}) as Domain;

beforeEach(() => {
	vol.reset();
	vi.clearAllMocks();
});

test("allows uploaded Caddy certificates assigned to the same server and organization", async () => {
	writeCertificateFiles("certificate-uploaded");
	certificatesFindFirstMock.mockResolvedValue({
		certificatePath: "certificate-uploaded",
		serverId: null,
		organizationId: "org-1",
	});

	await expect(
		assertCaddyDomainCertificateAvailable(null, domain(), "org-1"),
	).resolves.toBeUndefined();
});

test("requires organization context for uploaded Caddy certificate validation", async () => {
	writeCertificateFiles("certificate-uploaded");
	certificatesFindFirstMock.mockResolvedValue({
		certificatePath: "certificate-uploaded",
		serverId: null,
		organizationId: "org-1",
	});

	await expect(
		assertCaddyDomainCertificateAvailable(null, domain(), null),
	).rejects.toThrow(
		"Caddy custom certificate validation requires organization context",
	);
	expect(certificatesFindFirstMock).not.toHaveBeenCalled();
});

test("rejects missing, cross-server, or cross-organization Caddy certificate paths", async () => {
	certificatesFindFirstMock.mockResolvedValueOnce(null);
	await expect(
		assertCaddyDomainCertificateAvailable(null, domain(), "org-1"),
	).rejects.toThrow("is not available for this server and organization");

	certificatesFindFirstMock.mockResolvedValueOnce({
		certificatePath: "certificate-uploaded",
		serverId: "server-2",
		organizationId: "org-1",
	});
	await expect(
		assertCaddyDomainCertificateAvailable("server-1", domain(), "org-1"),
	).rejects.toThrow("is not available for this server and organization");

	certificatesFindFirstMock.mockResolvedValueOnce({
		certificatePath: "certificate-uploaded",
		serverId: null,
		organizationId: "org-2",
	});
	await expect(
		assertCaddyDomainCertificateAvailable(null, domain(), "org-1"),
	).rejects.toThrow("is not available for this server and organization");
});

test("rejects uploaded Caddy certificate rows when files are missing", async () => {
	certificatesFindFirstMock.mockResolvedValue({
		certificatePath: "certificate-uploaded",
		serverId: null,
		organizationId: "org-1",
	});

	await expect(
		assertCaddyDomainCertificateAvailable(null, domain(), "org-1"),
	).rejects.toThrow("missing readable chain.crt or privkey.key");
});

test("ignores stale custom certificate fields when HTTPS is disabled", async () => {
	await expect(
		assertCaddyDomainCertificateAvailable(
			null,
			domain({ https: false }),
			"org-1",
		),
	).resolves.toBeUndefined();
	expect(certificatesFindFirstMock).not.toHaveBeenCalled();
});

test("does not require organization context for non-custom Caddy certificates", async () => {
	await expect(
		assertCaddyDomainCertificateAvailable(
			null,
			domain({ certificateType: "letsencrypt", customCertResolver: null }),
			null,
		),
	).resolves.toBeUndefined();
	expect(certificatesFindFirstMock).not.toHaveBeenCalled();
});
