import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal context shape the mock tRPC procedure narrows to. The real tRPC
// context (used for the TypeScript types of `certificateRouter.createCaller`)
// additionally requires `db`/`req`/`res`, which are irrelevant to this gate and
// satisfied at the call site with an `any` cast.
type MockCtx = {
	session: { activeOrganizationId: string; userId: string };
	user: { id: string; email: string; role: string; ownerId: string };
};

const mockCreateCertificate = vi.hoisted(() => vi.fn());
const mockFindCertificateById = vi.hoisted(() => vi.fn());
const mockRemoveCertificateById = vi.hoisted(() => vi.fn());
const mockUpdateCertificate = vi.hoisted(() => vi.fn());
const mockGetAccessibleServerIds = vi.hoisted(() => vi.fn());

// Mutable Dokploy Cloud flag so individual tests can toggle IS_CLOUD. The
// getter on the mocked module keeps `import { IS_CLOUD }` a live binding.
const state = vi.hoisted(() => ({ IS_CLOUD: false }));

vi.mock("@dokploy/server", () => ({
	createCertificate: mockCreateCertificate,
	findCertificateById: mockFindCertificateById,
	removeCertificateById: mockRemoveCertificateById,
	updateCertificate: mockUpdateCertificate,
	getAccessibleServerIds: mockGetAccessibleServerIds,
	get IS_CLOUD() {
		return state.IS_CLOUD;
	},
}));

// Minimal real tRPC router so `createCaller` works. `withPermission` mirrors
// `protectedProcedure` (session presence check). The BOLA bug under test lives
// in the inline `getAccessibleServerIds` gate inside `create`, not in
// `withPermission`'s RBAC (covered by check-permission.test.ts), so we let RBAC
// pass through to isolate the ownership gate.
vi.mock("@/server/api/trpc", async () => {
	const { initTRPC, TRPCError } = await import("@trpc/server");
	const t = initTRPC.context<MockCtx>().create();
	const protectedProcedure = t.procedure.use(({ ctx, next }) => {
		if (!ctx?.session || !ctx?.user) {
			throw new TRPCError({ code: "UNAUTHORIZED" });
		}
		return next({ ctx: { session: ctx.session, user: ctx.user } });
	});
	return {
		createTRPCRouter: t.router,
		protectedProcedure,
		withPermission: () => protectedProcedure,
	};
});

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn().mockResolvedValue(undefined),
}));

import { certificateRouter } from "@/server/api/routers/certificate";

const ORG = "org-1";
const USER_ID = "user-1";

const buildCtx = (overrides: Record<string, unknown> = {}): any => ({
	user: {
		id: USER_ID,
		email: "test@test.com",
		role: "owner",
		ownerId: "owner-1",
		enableEnterpriseFeatures: true,
		isValidEnterpriseLicense: true,
	},
	session: { activeOrganizationId: ORG, userId: USER_ID },
	...overrides,
});

// Matches the frontend payload: organizationId is sent as "" and overridden
// server-side from ctx.session.activeOrganizationId in createCertificate().
const validInput = {
	name: "my-cert",
	certificateData: "-----BEGIN CERTIFICATE-----\nMII...",
	privateKey: "-----BEGIN PRIVATE KEY-----\nMII...",
	serverId: "srv-1",
	organizationId: "",
};

beforeEach(() => {
	vi.clearAllMocks();
	state.IS_CLOUD = false;
	mockCreateCertificate.mockResolvedValue({
		certificateId: "cert-1",
		name: "my-cert",
		serverId: "srv-1",
		organizationId: ORG,
	});
	mockGetAccessibleServerIds.mockResolvedValue(new Set(["srv-1"]));
});

describe("certificate.create serverId ownership gate (BOLA fix)", () => {
	it("rejects a serverId the caller cannot access with UNAUTHORIZED", async () => {
		mockGetAccessibleServerIds.mockResolvedValue(new Set(["srv-other"]));

		await expect(
			certificateRouter.createCaller(buildCtx()).create({
				...validInput,
				serverId: "srv-foreign",
			}),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this server",
		});

		expect(mockGetAccessibleServerIds).toHaveBeenCalledTimes(1);
		expect(mockGetAccessibleServerIds).toHaveBeenCalledWith({
			userId: USER_ID,
			activeOrganizationId: ORG,
		});
		// BOLA regression guard: the insert + remote SSH write must never happen.
		expect(mockCreateCertificate).not.toHaveBeenCalled();
	});

	it("creates the certificate when the serverId is accessible to the caller", async () => {
		const cert = await certificateRouter
			.createCaller(buildCtx())
			.create(validInput);

		expect(cert).toEqual({
			certificateId: "cert-1",
			name: "my-cert",
			serverId: "srv-1",
			organizationId: ORG,
		});
		expect(mockCreateCertificate).toHaveBeenCalledTimes(1);
		expect(mockCreateCertificate).toHaveBeenCalledWith(validInput, ORG);
	});

	it("passes caller's session (with userId) to getAccessibleServerIds", async () => {
		await certificateRouter.createCaller(buildCtx()).create(validInput);

		expect(mockGetAccessibleServerIds).toHaveBeenCalledWith({
			userId: USER_ID,
			activeOrganizationId: ORG,
		});
	});

	it("does NOT call getAccessibleServerIds when no serverId is supplied (self-hosted)", async () => {
		const { serverId: _omit, ...noServerInput } = validInput;

		await certificateRouter.createCaller(buildCtx()).create(noServerInput);

		expect(mockGetAccessibleServerIds).not.toHaveBeenCalled();
		expect(mockCreateCertificate).toHaveBeenCalledTimes(1);
	});

	it("on cloud, rejects a missing serverId with the presence-check error", async () => {
		state.IS_CLOUD = true;
		const { serverId: _omit, ...noServerInput } = validInput;

		await expect(
			certificateRouter.createCaller(buildCtx()).create(noServerInput),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "Please set a server to create a certificate",
		});

		expect(mockGetAccessibleServerIds).not.toHaveBeenCalled();
		expect(mockCreateCertificate).not.toHaveBeenCalled();
	});

	it("on cloud, still enforces the ownership gate for a supplied serverId", async () => {
		state.IS_CLOUD = true;
		mockGetAccessibleServerIds.mockResolvedValue(new Set(["srv-own"]));

		await expect(
			certificateRouter.createCaller(buildCtx()).create({
				...validInput,
				serverId: "srv-foreign",
			}),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this server",
		});

		expect(mockCreateCertificate).not.toHaveBeenCalled();
	});

	it("rejects when getAccessibleServerIds returns an empty set (restricted member)", async () => {
		// Simulates a licensed org member whose accessedServers excludes every
		// server — the path 1 exploit scenario from the report.
		mockGetAccessibleServerIds.mockResolvedValue(new Set());

		await expect(
			certificateRouter.createCaller(buildCtx()).create({
				...validInput,
				serverId: "srv-1",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mockCreateCertificate).not.toHaveBeenCalled();
	});

	it("on cloud, allows a missing serverId when caller has an accessible server — N/A (cloud requires serverId)", async () => {
		// Documents the precedence: the IS_CLOUD presence check runs first.
		state.IS_CLOUD = true;
		mockGetAccessibleServerIds.mockResolvedValue(new Set(["srv-1"]));

		// Supplying an accessible serverId succeeds.
		const cert = await certificateRouter
			.createCaller(buildCtx())
			.create(validInput);
		expect(mockCreateCertificate).toHaveBeenCalledTimes(1);
		expect(cert.serverId).toBe("srv-1");
	});
});
