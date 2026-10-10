import {
	createDomain,
	normalizeDomainPath,
	updateDomainById,
} from "@dokploy/server/services/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
	findFirst: vi.fn(),
	findMany: vi.fn(),
	insert: vi.fn(),
	update: vi.fn(),
	transaction: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			domains: {
				findFirst: mockDb.findFirst,
				findMany: mockDb.findMany,
			},
			previewDeployments: {
				findFirst: vi.fn(),
			},
		},
		insert: mockDb.insert,
		update: mockDb.update,
		transaction: mockDb.transaction,
	},
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn().mockResolvedValue({
		applicationId: "app-1",
		serverId: "server-1",
	}),
}));

vi.mock("@dokploy/server/services/compose", () => ({
	findComposeById: vi.fn().mockResolvedValue({
		composeId: "compose-1",
		serverId: "server-1",
	}),
}));

vi.mock("@dokploy/server/utils/traefik/domain", () => ({
	manageDomain: vi.fn(),
}));

describe("Domain duplicate conflict validation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.transaction.mockImplementation(async (callback: any) =>
			callback({
				insert: mockDb.insert,
			}),
		);
		mockDb.insert.mockReturnValue({
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						domainId: "new-domain-id",
						host: "app.example.com",
						path: "/",
					},
				]),
			}),
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("normalizes domain paths correctly", () => {
		expect(normalizeDomainPath(null)).toBe("/");
		expect(normalizeDomainPath("")).toBe("/");
		expect(normalizeDomainPath("/")).toBe("/");
		expect(normalizeDomainPath("api")).toBe("/api");
		expect(normalizeDomainPath("/api")).toBe("/api");
		expect(normalizeDomainPath("/api/")).toBe("/api");
	});

	it("throws CONFLICT error when creating a domain with matching host and path on the same server", async () => {
		mockDb.findMany.mockResolvedValue([
			{
				domainId: "existing-1",
				host: "app.example.com",
				path: "/",
				application: { serverId: "server-1" },
			},
		]);

		await expect(
			createDomain({
				host: "app.example.com",
				path: "/",
				applicationId: "app-1",
			}),
		).rejects.toMatchObject({
			code: "CONFLICT",
			message: "Domain 'app.example.com' is already in use on this server",
		});
	});

	it("allows creating a domain with matching host when path prefix is different", async () => {
		mockDb.findMany.mockResolvedValue([
			{
				domainId: "existing-1",
				host: "app.example.com",
				path: "/",
				application: { serverId: "server-1" },
			},
		]);

		const result = await createDomain({
			host: "app.example.com",
			path: "/api",
			applicationId: "app-1",
		});

		expect(result).toBeDefined();
		expect(result.domainId).toBe("new-domain-id");
	});

	it("successfully creates a new domain when no matching host exists", async () => {
		mockDb.findMany.mockResolvedValue([]);

		const result = await createDomain({
			host: "   fresh-domain.example.com   ",
			path: "/",
			applicationId: "app-1",
		});

		expect(result).toBeDefined();
		expect(result.domainId).toBe("new-domain-id");
	});

	it("treats host matching as case-insensitive per RFC 4343", async () => {
		mockDb.findMany.mockResolvedValue([
			{
				domainId: "existing-1",
				host: "app.example.com",
				path: "/",
				application: { serverId: "server-1" },
			},
		]);

		await expect(
			createDomain({
				host: "APP.EXAMPLE.COM",
				path: "/",
				applicationId: "app-1",
			}),
		).rejects.toMatchObject({
			code: "CONFLICT",
			message: "Domain 'APP.EXAMPLE.COM' is already in use on this server",
		});
	});

	it("allows the same host and path on separate remote servers", async () => {
		mockDb.findMany.mockResolvedValue([
			{
				domainId: "existing-1",
				host: "app.example.com",
				path: "/",
				application: { serverId: "server-2" },
			},
		]);

		const result = await createDomain({
			host: "app.example.com",
			path: "/",
			applicationId: "app-1", // server-1
		});

		expect(result).toBeDefined();
	});

	it("throws BAD_REQUEST when updating with empty host string", async () => {
		mockDb.findFirst.mockResolvedValue({
			domainId: "my-domain-id",
			host: "app.example.com",
			path: "/",
			application: { serverId: "server-1" },
		});

		await expect(
			updateDomainById("my-domain-id", {
				host: "   ",
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Host cannot be empty",
		});
	});

	it("allows updating a domain when keeping its own existing host and path", async () => {
		mockDb.findFirst.mockResolvedValue({
			domainId: "my-domain-id",
			host: "same.example.com",
			path: "/",
			application: { serverId: "server-1" },
		});

		mockDb.findMany.mockResolvedValue([
			{
				domainId: "my-domain-id",
				host: "same.example.com",
				path: "/",
				application: { serverId: "server-1" },
			},
		]);

		mockDb.update.mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([
						{
							domainId: "my-domain-id",
							host: "same.example.com",
							https: true,
						},
					]),
				}),
			}),
		});

		const result = await updateDomainById("my-domain-id", {
			host: "same.example.com",
			https: true,
		});

		expect(result).toMatchObject({
			domainId: "my-domain-id",
			host: "same.example.com",
		});
	});
});
