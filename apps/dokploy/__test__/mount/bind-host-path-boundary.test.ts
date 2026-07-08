import fs from "node:fs/promises";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { apiUpdateMount } from "@dokploy/server/db/schema";
import { createMount, updateMount } from "@dokploy/server/services/mount";
import { generateBindMounts } from "@dokploy/server/utils/docker/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => {
	const insertReturning = vi.fn();
	const updateReturning = vi.fn();
	const updateSet = vi.fn(() => ({
		where: vi.fn(() => ({
			returning: updateReturning,
		})),
	}));

	return {
		insertReturning,
		updateSet,
		updateReturning,
		db: {
			insert: vi.fn(() => ({
				values: vi.fn(() => ({
					returning: insertReturning,
				})),
			})),
			transaction: vi.fn(async (callback) =>
				callback({
					update: vi.fn(() => ({
						set: updateSet,
					})),
				}),
			),
			query: {
				applications: {
					findFirst: vi.fn(),
				},
				compose: {
					findFirst: vi.fn(),
				},
				libsql: {
					findFirst: vi.fn(),
				},
				mariadb: {
					findFirst: vi.fn(),
				},
				mongo: {
					findFirst: vi.fn(),
				},
				mysql: {
					findFirst: vi.fn(),
				},
				mounts: {
					findFirst: vi.fn(),
				},
				postgres: {
					findFirst: vi.fn(),
				},
				redis: {
					findFirst: vi.fn(),
				},
			},
		},
	};
});

vi.mock("@dokploy/server/db", () => ({
	db: mockDb.db,
}));

describe("bind mount host path boundary", () => {
	const appName = `bind-boundary-test-${process.pid}`;
	const serviceRoot = path.join(paths(false).APPLICATIONS_PATH, appName);
	const safeHostPath = path.join(serviceRoot, "bind-data");
	const composeAppName = `compose-bind-boundary-test-${process.pid}`;
	const safeComposeHostPath = path.join(
		paths(false).COMPOSE_PATH,
		composeAppName,
		"bind-data",
	);
	const safeMount = {
		mountId: "mount-1",
		type: "bind",
		hostPath: safeHostPath,
		mountPath: "/data",
		serviceType: "application",
		applicationId: "app-1",
		application: {
			appName,
			serverId: null,
			environment: {
				project: {
					organizationId: "org-1",
				},
			},
		},
		compose: null,
		libsql: null,
		mariadb: null,
		mongo: null,
		mysql: null,
		postgres: null,
		redis: null,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.insertReturning.mockResolvedValue([
			{
				mountId: "mount-1",
				type: "bind",
				hostPath: safeHostPath,
				mountPath: "/data",
			},
		]);
		mockDb.updateReturning.mockResolvedValue([safeMount]);
		mockDb.db.query.applications.findFirst.mockResolvedValue({
			appName,
			serverId: null,
		});
		mockDb.db.query.mounts.findFirst.mockResolvedValue(safeMount);
	});

	afterEach(async () => {
		await fs.rm(serviceRoot, {
			force: true,
			recursive: true,
		});
	});

	it("rejects unsafe bind host paths on create before persistence", async () => {
		await expect(
			createMount({
				serviceId: "app-1",
				serviceType: "application",
				type: "bind",
				hostPath: "/etc/passwd",
				mountPath: "/host-passwd",
			}),
		).rejects.toThrow("Invalid bind mount host path");

		expect(mockDb.db.insert).not.toHaveBeenCalled();
	});

	it("stores service-scoped bind host paths on create", async () => {
		await createMount({
			serviceId: "app-1",
			serviceType: "application",
			type: "bind",
			hostPath: safeHostPath,
			mountPath: "/data",
		});

		const insertBuilder = mockDb.db.insert.mock.results[0]?.value;
		expect(insertBuilder.values).toHaveBeenCalledWith(
			expect.objectContaining({
				applicationId: "app-1",
				hostPath: safeHostPath,
				mountPath: "/data",
				type: "bind",
			}),
		);
	});

	it("rejects unsafe bind host path updates before persistence", async () => {
		await expect(
			updateMount("mount-1", {
				hostPath: "/var/run/docker.sock",
			}),
		).rejects.toThrow("Invalid bind mount host path");

		expect(mockDb.db.transaction).not.toHaveBeenCalled();
	});

	it("strips service ownership fields from mount updates before persistence", async () => {
		await expect(
			updateMount("mount-1", {
				applicationId: "victim-app",
				composeId: "victim-compose",
				mountId: "other-mount",
				mountPath: "/data",
				serviceType: "compose",
			} as any),
		).resolves.toMatchObject({ mountId: "mount-1" });

		const persistedData = (mockDb.updateSet.mock.calls as unknown[][])[0]?.[0];
		expect(persistedData).toMatchObject({
			hostPath: safeHostPath,
			mountPath: "/data",
		});
		expect(persistedData).not.toHaveProperty("applicationId");
		expect(persistedData).not.toHaveProperty("composeId");
		expect(persistedData).not.toHaveProperty("mountId");
		expect(persistedData).not.toHaveProperty("serviceType");
	});

	it("strips service ownership fields from mount update API payloads", () => {
		expect(
			apiUpdateMount.parse({
				applicationId: "victim-app",
				composeId: "victim-compose",
				mountId: "mount-1",
				mountPath: "/data",
				serviceType: "compose",
			}),
		).toEqual({
			mountId: "mount-1",
			mountPath: "/data",
		});
	});

	it("rejects unsafe persisted bind sources before Docker mount generation", () => {
		expect(() =>
			generateBindMounts(
				[
					{
						type: "bind",
						hostPath: "/root/.ssh",
						mountPath: "/host-ssh",
					},
				] as any,
				{
					appName,
					serverId: null,
					serviceType: "application",
				},
			),
		).toThrow("Invalid bind mount host path");
	});

	it("rejects symlink escapes inside service-scoped paths", async () => {
		const symlinkPath = path.join(serviceRoot, "escape");
		await fs.mkdir(serviceRoot, {
			recursive: true,
		});
		await fs.symlink("/", symlinkPath);

		expect(() =>
			generateBindMounts(
				[
					{
						type: "bind",
						hostPath: path.join(symlinkPath, "etc"),
						mountPath: "/host-etc",
					},
				] as any,
				{
					appName,
					serverId: null,
					serviceType: "application",
				},
			),
		).toThrow("Invalid bind mount host path");
	});

	it("rejects mounting the exact owning service root", () => {
		expect(() =>
			generateBindMounts(
				[
					{
						type: "bind",
						hostPath: serviceRoot,
						mountPath: "/service-root",
					},
				] as any,
				{
					appName,
					serverId: null,
					serviceType: "application",
				},
			),
		).toThrow("Invalid bind mount host path");
	});

	it("keeps service-scoped bind sources for Docker mount generation", () => {
		expect(
			generateBindMounts(
				[
					{
						type: "bind",
						hostPath: safeHostPath,
						mountPath: "/data",
					},
				] as any,
				{
					appName,
					serverId: null,
					serviceType: "application",
				},
			),
		).toEqual([
			{
				Type: "bind",
				Source: safeHostPath,
				Target: "/data",
			},
		]);
	});

	it("uses compose-owned directories for compose bind mounts", () => {
		expect(
			generateBindMounts(
				[
					{
						type: "bind",
						hostPath: safeComposeHostPath,
						mountPath: "/compose-data",
					},
				] as any,
				{
					appName: composeAppName,
					serverId: null,
					serviceType: "compose",
				},
			),
		).toEqual([
			{
				Type: "bind",
				Source: safeComposeHostPath,
				Target: "/compose-data",
			},
		]);
	});
});
