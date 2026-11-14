import { getLibreDBStudioImage } from "@dokploy/server/utils/libredb-studio/constants";
import { readEnvVar } from "@dokploy/server/utils/libredb-studio/env";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cloud = vi.hoisted(() => ({ enabled: false }));

const server = vi.hoisted(() => ({
	updateApplication: vi.fn(),
}));

const permission = vi.hoisted(() => ({
	checkPermission: vi.fn(),
	checkServiceAccess: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
}));

const studioService = vi.hoisted(() => ({
	findLibreDBStudioById: vi.fn(),
	getLibreDBStudioUrl: vi.fn(),
	getLibreDBStudioView: vi.fn(),
	studioNotFound: vi.fn(),
	syncLibreDBStudio: vi.fn(),
	updateLibreDBStudio: vi.fn(),
}));

const launchToken = vi.hoisted(() => ({
	createLaunchToken: vi.fn(),
}));

const studioHost = vi.hoisted(() => ({
	isHostUsedByAnotherService: vi.fn(),
}));

const audit = vi.hoisted(() => vi.fn());

const queue = vi.hoisted(() => ({
	cleanQueuesByApplication: vi.fn(),
	myQueue: { add: vi.fn() },
}));

vi.mock("@dokploy/server", () => ({
	get IS_CLOUD() {
		return cloud.enabled;
	},
	...server,
}));

vi.mock("@dokploy/server/services/permission", () => permission);

vi.mock("@dokploy/server/services/libredb-studio", () => studioService);

vi.mock("@dokploy/server/utils/libredb-studio/host", () => studioHost);

vi.mock("@dokploy/server/utils/libredb-studio/launch-token", () => launchToken);

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({ audit }));

vi.mock("@/server/queues/queueSetup", () => queue);

const { libredbStudioRouter } = await import(
	"@/server/api/routers/libredb-studio"
);

const caller = (role = "owner", headers: Record<string, string> = {}) =>
	libredbStudioRouter.createCaller({
		req: { headers },
		session: { activeOrganizationId: "org-1", userId: "user-1" },
		user: {
			id: "user-1",
			email: `${role}@example.com`,
			role,
			ownerId: "owner-1",
		},
	} as Parameters<typeof libredbStudioRouter.createCaller>[0]);

const denied = (message = "Permission denied") =>
	new TRPCError({ code: "UNAUTHORIZED", message });

const APP_NAME = "demo-shop-libredb-studio-abc123";
const TOKEN = "header.payload.signature";
const SECRETS_NOT_DECRYPTED =
	"The LibreDB Studio secrets cannot be decrypted with the current Dokploy encryption key. Restore the ENCRYPTION_KEY or BETTER_AUTH_SECRET that encrypted them, or remove this Studio and install it again.";
const STUDIO_SECRETS = {
	launchSecret: "l".repeat(64),
	jwtSecret: "j".repeat(64),
	adminPassword: "p".repeat(24),
};

const domain = (host: string, https: boolean, enabled = true) => ({
	domainId: `domain-${host}`,
	host,
	https,
	path: "/",
	domainType: "application",
	enabled,
});

const studioRow = (application: Record<string, unknown> = {}) => ({
	libredbStudioId: "studio-1",
	applicationId: "app-1",
	allowCustomConnections: false,
	seedHash: null,
	lastSyncedAt: null,
	lastSyncError: null,
	...STUDIO_SECRETS,
	createdAt: "2026-10-03T00:00:00.000Z",
	application: {
		applicationId: "app-1",
		appName: APP_NAME,
		environmentId: "env-1",
		serverId: null,
		applicationStatus: "done",
		env: "ADMIN_EMAIL=owner@example.com\nSTORAGE_PROVIDER=sqlite",
		domains: [domain("studio.example.com", true)],
		environment: {
			projectId: "project-1",
			project: { organizationId: "org-1" },
		},
		...application,
	},
});

const studioView = { libredbStudioId: "studio-1", applicationId: "app-1" };

beforeEach(() => {
	vi.resetAllMocks();
	cloud.enabled = false;

	studioService.findLibreDBStudioById.mockResolvedValue(studioRow());
	studioService.getLibreDBStudioUrl.mockReturnValue({
		url: "https://studio.example.com",
		https: true,
	});
	studioService.getLibreDBStudioView.mockResolvedValue(studioView);
	studioService.syncLibreDBStudio.mockResolvedValue({
		changed: true,
		networksChanged: false,
	});
	launchToken.createLaunchToken.mockReturnValue(TOKEN);
	queue.myQueue.add.mockResolvedValue({ id: "job-1" });
});

describe("libredbStudio router actions on Dokploy Cloud", () => {
	it.each([
		["sync", () => caller().sync({ libredbStudioId: "studio-1" })],
		["launch", () => caller().launch({ libredbStudioId: "studio-1" })],
		[
			"credentials",
			() => caller().credentials({ libredbStudioId: "studio-1" }),
		],
		[
			"update",
			() => caller().update({ libredbStudioId: "studio-1", updateImage: true }),
		],
	])("refuses %s", async (_name, call) => {
		cloud.enabled = true;

		await expect(call()).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "LibreDB Studio is not available on Dokploy Cloud",
		});
		expect(studioService.findLibreDBStudioById).not.toHaveBeenCalled();
	});
});

describe("libredbStudio actions across organizations", () => {
	it.each([
		["sync", () => caller().sync({ libredbStudioId: "studio-1" })],
		["launch", () => caller().launch({ libredbStudioId: "studio-1" })],
		[
			"credentials",
			() => caller().credentials({ libredbStudioId: "studio-1" }),
		],
		[
			"update",
			() => caller().update({ libredbStudioId: "studio-1", updateImage: true }),
		],
	])(
		"answers %s for a Studio of another organization like for an id that does not exist",
		async (_name, call) => {
			studioService.studioNotFound.mockImplementation(
				() =>
					new TRPCError({
						code: "NOT_FOUND",
						message: "The service's own not-found answer",
					}),
			);
			studioService.findLibreDBStudioById.mockRejectedValue(
				studioService.studioNotFound(),
			);
			const missing = await call().then(
				() => null,
				(error: TRPCError) => error,
			);

			const row = studioRow();
			row.application.environment.project.organizationId = "org-2";
			studioService.findLibreDBStudioById.mockResolvedValue(row);
			const foreign = await call().then(
				() => null,
				(error: TRPCError) => error,
			);

			expect(missing).toBeInstanceOf(TRPCError);
			expect(foreign).toBeInstanceOf(TRPCError);
			expect({ code: foreign?.code, message: foreign?.message }).toEqual({
				code: missing?.code,
				message: missing?.message,
			});
			expect(permission.checkServiceAccess).not.toHaveBeenCalled();
			expect(studioService.syncLibreDBStudio).not.toHaveBeenCalled();
			expect(launchToken.createLaunchToken).not.toHaveBeenCalled();
			expect(server.updateApplication).not.toHaveBeenCalled();
		},
	);
});

describe("libredbStudio.sync", () => {
	it("runs a forced sync for a caller allowed to deploy the Studio", async () => {
		await expect(
			caller().sync({ libredbStudioId: "studio-1" }),
		).resolves.toEqual({ changed: true, networksChanged: false });

		expect(permission.checkServiceAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-1",
			"read",
		);
		expect(permission.checkPermission).toHaveBeenCalledWith(expect.anything(), {
			deployment: ["create"],
		});
		expect(studioService.syncLibreDBStudio).toHaveBeenCalledWith("studio-1", {
			force: true,
		});
	});

	it("refuses a caller without deployment.create on the Studio", async () => {
		permission.checkPermission.mockRejectedValue(denied());

		await expect(
			caller("member").sync({ libredbStudioId: "studio-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(studioService.syncLibreDBStudio).not.toHaveBeenCalled();
	});

	describe("for a member", () => {
		// Mirrors the member rules of the permission helpers: service access by
		// accessedServices, and no change of a Studio through
		// checkServicePermissionAndAccess.
		const asMember = (accessedServices: string[]) => {
			permission.checkServiceAccess.mockImplementation(
				async (_ctx, serviceId) => {
					if (!accessedServices.includes(serviceId)) {
						throw denied("You don't have access to this service");
					}
				},
			);
			permission.checkPermission.mockResolvedValue(undefined);
			permission.checkServicePermissionAndAccess.mockRejectedValue(
				denied(
					"Only owners and admins of the organization can change a LibreDB Studio. Members can open it with Open in LibreDB Studio.",
				),
			);
		};

		it("runs Sync now with the Studio in accessedServices and deployment.create", async () => {
			asMember(["app-1"]);

			await expect(
				caller("member").sync({ libredbStudioId: "studio-1" }),
			).resolves.toEqual({ changed: true, networksChanged: false });
			expect(studioService.syncLibreDBStudio).toHaveBeenCalledWith("studio-1", {
				force: true,
			});
		});

		it("refuses Sync now without the Studio in accessedServices", async () => {
			asMember(["other-app"]);

			await expect(
				caller("member").sync({ libredbStudioId: "studio-1" }),
			).rejects.toMatchObject({
				code: "UNAUTHORIZED",
				message: "You don't have access to this service",
			});
			expect(studioService.syncLibreDBStudio).not.toHaveBeenCalled();
		});
	});

	it("reports a failed sync to the caller with its message", async () => {
		studioService.syncLibreDBStudio.mockRejectedValue(
			new Error("The Studio service could not be updated"),
		);

		await expect(
			caller().sync({ libredbStudioId: "studio-1" }),
		).rejects.toThrow("The Studio service could not be updated");
	});
});

describe("libredbStudio.launch", () => {
	it.each([
		["owner", "admin"],
		["admin", "admin"],
		["member", "user"],
		["deployer", "user"],
	])("signs the %s role in as a Studio %s", async (role, studioRole) => {
		const result = await caller(role).launch({
			libredbStudioId: "studio-1",
			connectionId: "dokploy-postgres-1a2b3c4d5e6f",
		});

		expect(permission.checkServiceAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-1",
			"read",
		);
		expect(launchToken.createLaunchToken).toHaveBeenCalledWith({
			secret: STUDIO_SECRETS.launchSecret,
			libredbStudioId: "studio-1",
			userId: "user-1",
			email: `${role}@example.com`,
			role: studioRole,
			connectionId: "dokploy-postgres-1a2b3c4d5e6f",
		});
		expect(result).toEqual({
			url: `https://studio.example.com/launch#token=${TOKEN}`,
		});
	});

	it("opens the address getLibreDBStudioUrl picks from every domain of the Studio", async () => {
		const domains = [
			domain("disabled.example.com", true, false),
			domain("plain.example.com", false),
		];
		studioService.findLibreDBStudioById.mockResolvedValue(
			studioRow({ domains }),
		);
		studioService.getLibreDBStudioUrl.mockReturnValue({
			url: "http://plain.example.com",
			https: false,
		});

		const result = await caller().launch({ libredbStudioId: "studio-1" });

		expect(studioService.getLibreDBStudioUrl).toHaveBeenCalledWith(domains);
		expect(result).toEqual({
			url: `http://plain.example.com/launch#token=${TOKEN}`,
		});
		expect(launchToken.createLaunchToken).toHaveBeenCalledWith(
			expect.objectContaining({ connectionId: undefined }),
		);
	});

	it("drops the path of the launch domain from the launch URL", async () => {
		studioService.getLibreDBStudioUrl.mockReturnValue({
			url: "https://studio.example.com/",
			https: true,
		});

		await expect(
			caller().launch({ libredbStudioId: "studio-1" }),
		).resolves.toEqual({
			url: `https://studio.example.com/launch#token=${TOKEN}`,
		});
	});

	it("asks for a domain when the Studio has no enabled domain", async () => {
		studioService.findLibreDBStudioById.mockResolvedValue(
			studioRow({ domains: [domain("studio.example.com", true, false)] }),
		);
		studioService.getLibreDBStudioUrl.mockReturnValue(null);

		await expect(
			caller().launch({ libredbStudioId: "studio-1" }),
		).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			message:
				"The LibreDB Studio has no enabled domain. Add a domain to its application first.",
		});
		expect(launchToken.createLaunchToken).not.toHaveBeenCalled();
	});

	it.each([
		["the Dokploy server", null],
		["a remote server", "server-1"],
	])(
		"refuses, before it signs, a Studio whose host another service on %s also uses",
		async (_name, serverId) => {
			studioService.findLibreDBStudioById.mockResolvedValue(
				studioRow({ serverId }),
			);
			studioHost.isHostUsedByAnotherService.mockResolvedValue(true);

			await expect(
				caller().launch({ libredbStudioId: "studio-1" }),
			).rejects.toMatchObject({
				code: "PRECONDITION_FAILED",
				message:
					"Another service uses this Studio's domain. Give the Studio a domain of its own before you open it.",
			});
			expect(studioHost.isHostUsedByAnotherService).toHaveBeenCalledWith({
				host: "studio.example.com",
				serverId,
				studioApplicationId: "app-1",
			});
			expect(launchToken.createLaunchToken).not.toHaveBeenCalled();
		},
	);

	it("refuses to launch a Studio that is not running", async () => {
		studioService.findLibreDBStudioById.mockResolvedValue(
			studioRow({ applicationStatus: "idle" }),
		);

		await expect(
			caller().launch({ libredbStudioId: "studio-1" }),
		).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			message: "The Studio is not running",
		});
		expect(launchToken.createLaunchToken).not.toHaveBeenCalled();
	});

	it("refuses a member who can read the database but not open the Studio, with a clear message", async () => {
		permission.checkServiceAccess.mockImplementation(
			async (_ctx, serviceId) => {
				if (serviceId === "app-1") {
					throw denied("You don't have access to this service");
				}
			},
		);

		await expect(
			caller("member").launch({
				libredbStudioId: "studio-1",
				connectionId: "dokploy-postgres-1a2b3c4d5e6f",
			}),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message:
				"You do not have access to this LibreDB Studio. Ask an owner or admin of the organization to give you access to its application.",
		});
		expect(permission.checkServiceAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-1",
			"read",
		);
		expect(launchToken.createLaunchToken).not.toHaveBeenCalled();
	});

	it("surfaces an access check that fails for another reason", async () => {
		permission.checkServiceAccess.mockRejectedValue(new Error("database down"));

		await expect(
			caller("member").launch({ libredbStudioId: "studio-1" }),
		).rejects.toThrow("database down");
		expect(launchToken.createLaunchToken).not.toHaveBeenCalled();
	});

	it.each(["launchSecret", "jwtSecret", "adminPassword"] as const)(
		"refuses to launch a Studio whose %s could not be decrypted",
		async (column) => {
			studioService.findLibreDBStudioById.mockResolvedValue({
				...studioRow(),
				[column]: "enc:v1:c3RpbGwgZW5jcnlwdGVk",
			});

			await expect(
				caller().launch({ libredbStudioId: "studio-1" }),
			).rejects.toMatchObject({
				code: "INTERNAL_SERVER_ERROR",
				message: SECRETS_NOT_DECRYPTED,
			});
			expect(launchToken.createLaunchToken).not.toHaveBeenCalled();
		},
	);

	it("rejects a connection id that is not a seed id", async () => {
		await expect(
			caller().launch({
				libredbStudioId: "studio-1",
				connectionId: "seed:Orders DB",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(studioService.findLibreDBStudioById).not.toHaveBeenCalled();
	});
});

describe("libredbStudio.credentials", () => {
	it.each(["owner", "admin"])(
		"returns the initial admin login to an %s",
		async (role) => {
			await expect(
				caller(role).credentials({ libredbStudioId: "studio-1" }),
			).resolves.toEqual({
				email: "owner@example.com",
				password: STUDIO_SECRETS.adminPassword,
			});
		},
	);

	it("reads the password from the libredb_studio row, never from the application env", async () => {
		studioService.findLibreDBStudioById.mockResolvedValue(
			studioRow({
				env: `ADMIN_EMAIL=owner@example.com\nADMIN_PASSWORD=${"e".repeat(24)}`,
			}),
		);

		await expect(
			caller().credentials({ libredbStudioId: "studio-1" }),
		).resolves.toEqual({
			email: "owner@example.com",
			password: STUDIO_SECRETS.adminPassword,
		});
	});

	it("refuses a member", async () => {
		await expect(
			caller("member").credentials({ libredbStudioId: "studio-1" }),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message:
				"Only owners and admins of the organization can manage the LibreDB Studio",
		});
		expect(studioService.findLibreDBStudioById).not.toHaveBeenCalled();
	});

	it.each(["launchSecret", "jwtSecret", "adminPassword"] as const)(
		"refuses to show the credentials of a Studio whose %s could not be decrypted",
		async (column) => {
			studioService.findLibreDBStudioById.mockResolvedValue({
				...studioRow(),
				[column]: "enc:v1:c3RpbGwgZW5jcnlwdGVk",
			});

			await expect(
				caller().credentials({ libredbStudioId: "studio-1" }),
			).rejects.toMatchObject({
				code: "INTERNAL_SERVER_ERROR",
				message: SECRETS_NOT_DECRYPTED,
			});
		},
	);

	it("reports a Studio whose environment lost ADMIN_EMAIL", async () => {
		studioService.findLibreDBStudioById.mockResolvedValue(
			studioRow({ env: "STORAGE_PROVIDER=sqlite" }),
		);

		await expect(
			caller().credentials({ libredbStudioId: "studio-1" }),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
			message:
				"The LibreDB Studio application has no ADMIN_EMAIL in its environment",
		});
	});
});

describe("libredbStudio.update", () => {
	const expectDeployQueued = () => {
		expect(queue.myQueue.add).toHaveBeenCalledWith(
			"deployments",
			{
				applicationId: "app-1",
				titleLog: "LibreDB Studio settings update",
				descriptionLog: "",
				type: "deploy",
				applicationType: "application",
				server: false,
				serverId: undefined,
			},
			{ removeOnComplete: true, removeOnFail: true },
		);
	};

	it("refuses a member", async () => {
		await expect(
			caller("member").update({
				libredbStudioId: "studio-1",
				allowCustomConnections: true,
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(studioService.updateLibreDBStudio).not.toHaveBeenCalled();
		expect(queue.myQueue.add).not.toHaveBeenCalled();
	});

	it("switches custom connections and redeploys the Studio", async () => {
		const result = await caller().update({
			libredbStudioId: "studio-1",
			allowCustomConnections: true,
		});

		expect(studioService.updateLibreDBStudio).toHaveBeenCalledWith("studio-1", {
			allowCustomConnections: true,
		});
		expect(server.updateApplication).not.toHaveBeenCalled();
		expectDeployQueued();
		expect(audit).toHaveBeenCalledWith(expect.anything(), {
			action: "update",
			resourceType: "application",
			resourceId: "app-1",
			resourceName: APP_NAME,
		});
		expect(result).toEqual(studioView);
	});

	it("sets AUTH_COOKIE_SECURE=false when the launch domain is plain HTTP", async () => {
		studioService.findLibreDBStudioById.mockResolvedValue(
			studioRow({ domains: [domain("plain.example.com", false)] }),
		);
		studioService.getLibreDBStudioUrl.mockReturnValue({
			url: "http://plain.example.com",
			https: false,
		});

		await caller().update({
			libredbStudioId: "studio-1",
			applyCookieSetting: true,
		});

		expect(studioService.getLibreDBStudioUrl).toHaveBeenCalledWith([
			domain("plain.example.com", false),
		]);
		const env = server.updateApplication.mock.calls[0]?.[1].env;
		expect(server.updateApplication).toHaveBeenCalledWith("app-1", { env });
		expect(readEnvVar(env, "AUTH_COOKIE_SECURE")).toBe("false");
		expect(readEnvVar(env, "ADMIN_EMAIL")).toBe("owner@example.com");
		expect(readEnvVar(env, "STORAGE_PROVIDER")).toBe("sqlite");
		for (const secret of Object.values(STUDIO_SECRETS)) {
			expect(env).not.toContain(secret);
		}
		expectDeployQueued();
	});

	it("removes AUTH_COOKIE_SECURE when the launch domain is HTTPS", async () => {
		studioService.findLibreDBStudioById.mockResolvedValue(
			studioRow({
				env: "ADMIN_EMAIL=owner@example.com\nAUTH_COOKIE_SECURE=false",
			}),
		);

		await caller().update({
			libredbStudioId: "studio-1",
			applyCookieSetting: true,
		});

		const env = server.updateApplication.mock.calls[0]?.[1].env;
		expect(readEnvVar(env, "AUTH_COOKIE_SECURE")).toBeNull();
		expect(readEnvVar(env, "ADMIN_EMAIL")).toBe("owner@example.com");
		expectDeployQueued();
	});

	it("moves the Studio to the recommended image", async () => {
		await caller().update({ libredbStudioId: "studio-1", updateImage: true });

		expect(server.updateApplication).toHaveBeenCalledWith("app-1", {
			dockerImage: getLibreDBStudioImage(),
		});
		expectDeployQueued();
	});

	it("changes nothing when the cookie setting has no launch domain to follow", async () => {
		studioService.findLibreDBStudioById.mockResolvedValue(
			studioRow({ domains: [] }),
		);
		studioService.getLibreDBStudioUrl.mockReturnValue(null);

		await expect(
			caller().update({
				libredbStudioId: "studio-1",
				allowCustomConnections: true,
				applyCookieSetting: true,
			}),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
		expect(studioService.updateLibreDBStudio).not.toHaveBeenCalled();
		expect(server.updateApplication).not.toHaveBeenCalled();
		expect(queue.myQueue.add).not.toHaveBeenCalled();
	});

	it("rejects an update without any change", async () => {
		await expect(
			caller().update({
				libredbStudioId: "studio-1",
				applyCookieSetting: false,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(studioService.findLibreDBStudioById).not.toHaveBeenCalled();
	});
});

describe("libredbStudio actions and the Studio secrets", () => {
	it.each([
		["sync", () => caller().sync({ libredbStudioId: "studio-1" })],
		["launch", () => caller().launch({ libredbStudioId: "studio-1" })],
		[
			"update",
			() => caller().update({ libredbStudioId: "studio-1", updateImage: true }),
		],
	])(
		"%s returns none of the secrets of the libredb_studio row",
		async (_name, call) => {
			const result = JSON.stringify(await call());

			for (const secret of Object.values(STUDIO_SECRETS)) {
				expect(result).not.toContain(secret);
			}
		},
	);
});

describe("libredbStudio actions called with an API key", () => {
	const API_KEY = { "x-api-key": "dokploy-api-key" };

	it.each([
		[
			"launch",
			() =>
				caller("owner", API_KEY).launch({
					libredbStudioId: "studio-1",
					connectionId: "dokploy-postgres-1a2b3c4d5e6f",
				}),
		],
		[
			"credentials",
			() =>
				caller("owner", API_KEY).credentials({ libredbStudioId: "studio-1" }),
		],
		[
			"credentials for a member",
			() =>
				caller("member", API_KEY).credentials({ libredbStudioId: "studio-1" }),
		],
	])("refuses %s", async (_name, call) => {
		await expect(call()).rejects.toMatchObject({
			code: "FORBIDDEN",
			message:
				"LibreDB Studio launch and credentials are not available to API keys",
		});
		expect(studioService.findLibreDBStudioById).not.toHaveBeenCalled();
		expect(permission.checkServiceAccess).not.toHaveBeenCalled();
		expect(launchToken.createLaunchToken).not.toHaveBeenCalled();
	});

	it("still runs sync", async () => {
		await expect(
			caller("owner", API_KEY).sync({ libredbStudioId: "studio-1" }),
		).resolves.toEqual({ changed: true, networksChanged: false });
	});

	it("still runs update", async () => {
		await expect(
			caller("owner", API_KEY).update({
				libredbStudioId: "studio-1",
				updateImage: true,
			}),
		).resolves.toEqual(studioView);
	});
});
