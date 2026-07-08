import { REDACTED_SECRET_VALUE } from "@dokploy/server/utils/security/redaction";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	checkPermission: vi.fn(),
	createDestination: vi.fn(),
	destinationFindMany: vi.fn(),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	findDestinationById: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	removeDestinationById: vi.fn(),
	assertDestinationEndpointAllowed: vi.fn(),
	updateDestinationById: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: true,
	createDestination: mocks.createDestination,
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
	findDestinationById: mocks.findDestinationById,
	getAccessibleServerIds: mocks.getAccessibleServerIds,
	removeDestinationById: mocks.removeDestinationById,
	updateDestinationById: mocks.updateDestinationById,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			destinations: {
				findMany: mocks.destinationFindMany,
			},
		},
	},
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
}));

vi.mock("@dokploy/server/utils/destination/endpoint", () => ({
	assertDestinationEndpointAllowed: mocks.assertDestinationEndpointAllowed,
	normalizeDestinationEndpointUrl: (endpoint: string) => endpoint,
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: mocks.audit,
}));

const { destinationRouter } = await import(
	"../../server/api/routers/destination"
);

const destinationInput = {
	name: "destination",
	provider: "AWS",
	accessKey: "AKIA",
	secretAccessKey: "secret",
	bucket: "bucket",
	region: "us-east-1",
	endpoint: "https://s3.example.com",
	additionalFlags: [],
	serverId: "server-1",
};

const createCaller = () =>
	destinationRouter.createCaller({
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

describe("destination router assigned-server boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.destinationFindMany.mockResolvedValue([]);
		mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
		mocks.assertDestinationEndpointAllowed.mockImplementation(
			async (endpoint: string) => endpoint,
		);
		mocks.findDestinationById.mockResolvedValue({
			destinationId: "destination-1",
			name: "destination",
			provider: "AWS",
			accessKey: "AKIA",
			secretAccessKey: "stored-secret",
			bucket: "bucket",
			region: "us-east-1",
			endpoint: "https://s3.example.com",
			additionalFlags: [],
			organizationId: "org-1",
		});
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));
	});

	it("redacts destination secrets from one and all", async () => {
		mocks.destinationFindMany.mockResolvedValue([
			{
				destinationId: "destination-1",
				name: "destination",
				provider: "AWS",
				accessKey: "AKIA",
				secretAccessKey: "stored-secret",
				bucket: "bucket",
				region: "us-east-1",
				endpoint: "https://s3.example.com",
				additionalFlags: [],
				organizationId: "org-1",
			},
		]);

		await expect(
			createCaller().one({ destinationId: "destination-1" }),
		).resolves.toMatchObject({
			secretAccessKey: REDACTED_SECRET_VALUE,
			accessKey: "AKIA",
		});

		const [result] = await createCaller().all();
		expect(result?.secretAccessKey).toBe(REDACTED_SECRET_VALUE);
		expect(result?.bucket).toBe("bucket");
	});

	it("preserves stored destination secrets when update receives the redacted placeholder", async () => {
		mocks.updateDestinationById.mockResolvedValue({
			destinationId: "destination-1",
			name: "destination",
			provider: "AWS",
			accessKey: "AKIA",
			secretAccessKey: "stored-secret",
			bucket: "bucket",
			region: "us-east-1",
			endpoint: "https://s3.example.com",
			additionalFlags: [],
			organizationId: "org-1",
		});

		const result = await createCaller().update({
			destinationId: "destination-1",
			name: "destination",
			provider: "AWS",
			accessKey: "AKIA",
			secretAccessKey: REDACTED_SECRET_VALUE,
			bucket: "bucket",
			region: "us-east-1",
			endpoint: "https://s3.example.com",
			additionalFlags: [],
		});

		expect(mocks.updateDestinationById).toHaveBeenCalledWith(
			"destination-1",
			expect.objectContaining({
				secretAccessKey: "stored-secret",
			}),
		);
		expect(result?.secretAccessKey).toBe(REDACTED_SECRET_VALUE);
	});

	it("denies cloud connection tests on inaccessible servers before remote rclone", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().testConnection(destinationInput),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("rejects unsafe cloud S3 endpoints before remote rclone", async () => {
		mocks.assertDestinationEndpointAllowed.mockRejectedValueOnce(
			new Error("S3 endpoint host is not allowed in cloud deployments"),
		);

		await expect(
			createCaller().testConnection({
				...destinationInput,
				endpoint: "https://169.254.169.254",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("allows cloud connection tests on accessible servers", async () => {
		await expect(
			createCaller().testConnection(destinationInput),
		).resolves.toBeUndefined();

		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"server-1",
			expect.stringContaining("rclone ls"),
		);
	});
});
