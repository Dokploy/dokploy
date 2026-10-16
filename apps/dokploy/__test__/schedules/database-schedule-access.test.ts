import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findDatabase: {
		postgres: vi.fn(),
		mysql: vi.fn(),
		mariadb: vi.fn(),
		mongo: vi.fn(),
		redis: vi.fn(),
		libsql: vi.fn(),
	},
	checkServicePermissionAndAccess: vi.fn(),
}));

vi.mock("@trpc/server", () => ({
	TRPCError: class extends Error {
		code: string;

		constructor({ code, message }: { code: string; message: string }) {
			super(message);
			this.code = code;
		}
	},
}));
vi.mock("@dokploy/server/services/postgres", () => ({
	findPostgresById: mocks.findDatabase.postgres,
}));
vi.mock("@dokploy/server/services/mysql", () => ({
	findMySqlById: mocks.findDatabase.mysql,
}));
vi.mock("@dokploy/server/services/mariadb", () => ({
	findMariadbById: mocks.findDatabase.mariadb,
}));
vi.mock("@dokploy/server/services/mongo", () => ({
	findMongoById: mocks.findDatabase.mongo,
}));
vi.mock("@dokploy/server/services/redis", () => ({
	findRedisById: mocks.findDatabase.redis,
}));
vi.mock("@dokploy/server/services/libsql", () => ({
	findLibsqlById: mocks.findDatabase.libsql,
}));
vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

const { checkDatabaseScheduleAccess } = await import(
	"@/server/api/utils/database-schedule-access"
);

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

beforeEach(() => {
	vi.resetAllMocks();
	for (const findDatabase of Object.values(mocks.findDatabase)) {
		findDatabase.mockResolvedValue({
			environment: { project: { organizationId: "org-1" } },
		});
	}
});

describe.each([
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
	"libsql",
] as const)("%s schedule permissions", (databaseType) => {
	it.each(["create", "read", "update", "delete"] as const)(
		"checks the %s schedule permission and service access",
		async (action) => {
			const permissions = { schedule: [action] };
			await checkDatabaseScheduleAccess(
				ctx,
				databaseType,
				"database-1",
				permissions,
			);

			expect(
				mocks.checkServicePermissionAndAccess,
			).toHaveBeenCalledExactlyOnceWith(ctx, "database-1", permissions);
			for (const [type, findDatabase] of Object.entries(mocks.findDatabase)) {
				if (type === databaseType) {
					expect(findDatabase).toHaveBeenCalledExactlyOnceWith("database-1");
				} else {
					expect(findDatabase).not.toHaveBeenCalled();
				}
			}
		},
	);

	it("does not require read permission when cancelling a run", async () => {
		mocks.checkServicePermissionAndAccess.mockImplementation(
			async (_ctx, _id, permissions) => {
				if (permissions.deployment.includes("read")) {
					throw new Error("Read access denied");
				}
			},
		);
		await checkDatabaseScheduleAccess(ctx, databaseType, "database-1", {
			deployment: ["cancel"],
		});

		expect(
			mocks.checkServicePermissionAndAccess,
		).toHaveBeenCalledExactlyOnceWith(ctx, "database-1", {
			deployment: ["cancel"],
		});
	});

	it("rejects databases belonging to a different organization", async () => {
		mocks.findDatabase[databaseType].mockResolvedValue({
			environment: { project: { organizationId: "another-org" } },
		});

		await expect(
			checkDatabaseScheduleAccess(ctx, databaseType, "database-1", {
				schedule: ["read"],
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("rejects permission failures before looking up the database", async () => {
		mocks.checkServicePermissionAndAccess.mockRejectedValue(
			new Error("Access denied"),
		);

		await expect(
			checkDatabaseScheduleAccess(ctx, databaseType, "database-1", {
				schedule: ["read"],
			}),
		).rejects.toThrow("Access denied");
		for (const findDatabase of Object.values(mocks.findDatabase)) {
			expect(findDatabase).not.toHaveBeenCalled();
		}
	});
});
