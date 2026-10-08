import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Wave 2 of the cross-organization `serverId` sweep.
 *
 * `withPermission(...)` / `adminProcedure` only prove the caller holds a
 * role/permission inside their *active* organization -- they say nothing about
 * the `serverId` the caller passes in. These procedures take that `serverId`
 * straight to an SSH exec (docker login, rclone, rm -rf) or write files onto
 * it, so they must additionally verify the target server belongs to the
 * caller's organization.
 */
vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(() => Promise.resolve()),
}));

vi.mock("@dokploy/server/services/permission", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@dokploy/server/services/permission")
		>();
	return {
		...actual,
		checkPermission: vi.fn(async () => {}),
	};
});

vi.mock("@dokploy/server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@dokploy/server")>();
	return {
		...actual,
		findServerById: vi.fn(async () => ({
			serverId: "srv-1",
			organizationId: "org-1",
			serverStatus: "active",
		})),
		createCertificate: vi.fn(async () => ({
			certificateId: "cert-1",
			name: "cert",
		})),
		cleanPatchRepos: vi.fn(async () => {}),
		execAsync: vi.fn(async () => ({ stdout: "", stderr: "" })),
		execAsyncRemote: vi.fn(async () => ({ stdout: "", stderr: "" })),
		runDockerLogin: vi.fn(async () => {}),
		getRclonePathAndFlags: vi.fn(async () => ({
			flags: [] as string[],
			path: ":s3:bucket/",
			envVars: "",
		})),
	};
});

const { appRouter } = await import("@/server/api/root");
const { createCallerFactory } = await import("@/server/api/trpc");
const { db } = await import("@dokploy/server/db");
const {
	cleanPatchRepos,
	createCertificate,
	execAsync,
	execAsyncRemote,
	runDockerLogin,
	findServerById,
} = await import("@dokploy/server");

const createCaller = createCallerFactory(appRouter);

const ownerCtx = {
	user: { id: "user-1", email: "owner@test.com", role: "owner" },
	session: { activeOrganizationId: "org-1" },
	req: {} as unknown,
	res: {} as unknown,
} as never;

const noOrganizationCtx = {
	user: { id: "user-1", email: "owner@test.com", role: "owner" },
	session: { activeOrganizationId: undefined },
	req: {} as unknown,
	res: {} as unknown,
} as never;

const serverInOrganization = (organizationId: string) => {
	vi.mocked(findServerById).mockResolvedValue({
		serverId: "srv-1",
		organizationId,
		serverStatus: "active",
	} as Awaited<ReturnType<typeof findServerById>>);
};

const registryRow = (organizationId: string) => ({
	registryId: "reg-1",
	registryName: "reg",
	registryType: "cloud",
	registryUrl: "registry.example.com",
	username: "user",
	password: "pass",
	imagePrefix: null,
	organizationId,
});

const certificateInput = {
	name: "cert",
	certificateData: "data",
	privateKey: "key",
	organizationId: "",
	serverId: "srv-1",
};

const destinationInput = {
	name: "dest",
	provider: "s3",
	accessKey: "ak",
	secretAccessKey: "sk",
	bucket: "bucket",
	region: "us-east-1",
	endpoint: "https://s3.example.com",
	additionalFlags: [] as string[],
	serverId: "srv-1",
};

beforeEach(() => {
	vi.clearAllMocks();
	serverInOrganization("org-1");
	vi.mocked(db.query.registry.findFirst).mockResolvedValue(
		registryRow("org-1") as never,
	);
});

describe("certificate.create is organization-scoped", () => {
	it("rejects a serverId from another organization", async () => {
		serverInOrganization("org-2");
		const caller = createCaller(ownerCtx);

		await expect(
			caller.certificates.create(certificateInput),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(createCertificate).not.toHaveBeenCalled();
	});

	it("allows a serverId from the caller's organization", async () => {
		const caller = createCaller(ownerCtx);

		await expect(
			caller.certificates.create(certificateInput),
		).resolves.toMatchObject({ certificateId: "cert-1" });
		expect(createCertificate).toHaveBeenCalled();
	});

	it("rejects when the caller has no active organization", async () => {
		const caller = createCaller(noOrganizationCtx);

		await expect(
			caller.certificates.create(certificateInput),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(createCertificate).not.toHaveBeenCalled();
	});

	it("still allows a local (serverId-less) certificate", async () => {
		const caller = createCaller(ownerCtx);

		await expect(
			caller.certificates.create({ ...certificateInput, serverId: undefined }),
		).resolves.toMatchObject({ certificateId: "cert-1" });
		expect(findServerById).not.toHaveBeenCalled();
	});
});

describe("registry.testRegistry is organization-scoped", () => {
	const input = {
		registryUrl: "registry.example.com",
		registryType: "cloud" as const,
		username: "user",
		password: "pass",
		serverId: "srv-1",
	};

	it("rejects a serverId from another organization", async () => {
		serverInOrganization("org-2");
		const caller = createCaller(ownerCtx);

		await expect(caller.registry.testRegistry(input)).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		expect(runDockerLogin).not.toHaveBeenCalled();
	});

	it("allows a serverId from the caller's organization", async () => {
		const caller = createCaller(ownerCtx);

		await expect(caller.registry.testRegistry(input)).resolves.toBe(true);
		expect(runDockerLogin).toHaveBeenCalledWith(
			expect.objectContaining({ password: "pass" }),
			"srv-1",
		);
	});

	it("runs locally without a server lookup when no serverId is given", async () => {
		const caller = createCaller(ownerCtx);

		await expect(
			caller.registry.testRegistry({ ...input, serverId: undefined }),
		).resolves.toBe(true);
		expect(findServerById).not.toHaveBeenCalled();
		expect(runDockerLogin).toHaveBeenCalledWith(
			expect.objectContaining({ password: "pass" }),
			undefined,
		);
	});
});

describe("registry.testRegistryById is organization-scoped", () => {
	const input = { registryId: "reg-1", serverId: "srv-1" };

	it("rejects a registry from another organization", async () => {
		vi.mocked(db.query.registry.findFirst).mockResolvedValue(
			registryRow("org-2") as never,
		);
		const caller = createCaller(ownerCtx);

		await expect(caller.registry.testRegistryById(input)).rejects.toMatchObject(
			{ code: "UNAUTHORIZED" },
		);
		expect(runDockerLogin).not.toHaveBeenCalled();
	});

	it("rejects a serverId from another organization", async () => {
		serverInOrganization("org-2");
		const caller = createCaller(ownerCtx);

		await expect(caller.registry.testRegistryById(input)).rejects.toMatchObject(
			{ code: "UNAUTHORIZED" },
		);
		expect(runDockerLogin).not.toHaveBeenCalled();
	});

	it("allows a registry and serverId from the caller's organization", async () => {
		const caller = createCaller(ownerCtx);

		await expect(caller.registry.testRegistryById(input)).resolves.toBe(true);
		expect(runDockerLogin).toHaveBeenCalledWith(
			expect.objectContaining({ password: "pass" }),
			"srv-1",
		);
	});
});

describe("destination.testConnection is organization-scoped", () => {
	it("rejects a serverId from another organization", async () => {
		serverInOrganization("org-2");
		const caller = createCaller(ownerCtx);

		await expect(
			caller.destination.testConnection(destinationInput),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(execAsync).not.toHaveBeenCalled();
		expect(execAsyncRemote).not.toHaveBeenCalled();
	});

	it("allows a serverId from the caller's organization", async () => {
		const caller = createCaller(ownerCtx);

		await expect(
			caller.destination.testConnection(destinationInput),
		).resolves.not.toThrow();
		expect(execAsync).toHaveBeenCalledWith(
			expect.stringContaining("rclone ls"),
		);
	});
});

describe("patch.cleanPatchRepos is organization-scoped", () => {
	it("rejects a serverId from another organization", async () => {
		serverInOrganization("org-2");
		const caller = createCaller(ownerCtx);

		await expect(
			caller.patch.cleanPatchRepos({ serverId: "srv-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(cleanPatchRepos).not.toHaveBeenCalled();
	});

	it("allows a serverId from the caller's organization", async () => {
		const caller = createCaller(ownerCtx);

		await expect(
			caller.patch.cleanPatchRepos({ serverId: "srv-1" }),
		).resolves.toBe(true);
		expect(cleanPatchRepos).toHaveBeenCalledWith("srv-1");
	});

	it("still allows the local cleanup without a server lookup", async () => {
		const caller = createCaller(ownerCtx);

		await expect(caller.patch.cleanPatchRepos({})).resolves.toBe(true);
		expect(cleanPatchRepos).toHaveBeenCalledWith(undefined);
		expect(findServerById).not.toHaveBeenCalled();
	});
});
