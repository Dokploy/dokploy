import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ApplicationNested, Domain } from "@dokploy/server";
import { manageDomain, removeDomain } from "@dokploy/server";
import type { FileConfig } from "@dokploy/server/utils/traefik/file-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

const remoteFiles = vi.hoisted(() => new Map<string, string>());

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@dokploy/server/utils/process/execAsync")
		>();
	const delay = () => new Promise((r) => setTimeout(r, Math.random() * 10));
	return {
		...actual,
		execAsyncRemote: vi.fn(async (_serverId: string, command: string) => {
			await delay();
			const file = command.match(/^cat '?([^']+)'?$/)?.[1];
			return { stdout: (file && remoteFiles.get(file)) || "", stderr: "" };
		}),
		writeFileRemote: vi.fn(
			async (_serverId: string, filePath: string, content: string) => {
				await delay();
				remoteFiles.set(filePath, content);
			},
		),
	};
});

const appName = "race-app";

const domainFor = (uniqueConfigKey: number): Domain => ({
	applicationId: "app-1",
	certificateType: "none",
	createdAt: "",
	domainId: `domain-${uniqueConfigKey}`,
	host: `d${uniqueConfigKey}.example.com`,
	https: false,
	path: null,
	port: 3000,
	customEntrypoint: null,
	serviceName: "",
	composeId: "",
	customCertResolver: null,
	domainType: "application",
	uniqueConfigKey,
	previewDeploymentId: "",
	internalPath: "/",
	stripPath: false,
	middlewares: null,
	forwardAuthEnabled: false,
	enabled: true,
});

const keys = [1, 2, 3, 4, 5];

describe.each([
	["local", null],
	["remote", "server-1"],
])("concurrent domain changes (%s)", (_label, serverId) => {
	let cwd: string;
	const app = {
		appName,
		serverId,
		redirects: [],
		security: [],
	} as unknown as ApplicationNested;

	const readConfig = (): FileConfig => {
		const content = serverId
			? remoteFiles.get(`/etc/dokploy/traefik/dynamic/${appName}.yml`)
			: fs.readFileSync(
					path.join(cwd, ".docker/traefik/dynamic", `${appName}.yml`),
					"utf8",
				);
		return parse(content ?? "") as FileConfig;
	};

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-race-"));
		fs.mkdirSync(path.join(cwd, ".docker/traefik/dynamic"), {
			recursive: true,
		});
		vi.spyOn(process, "cwd").mockReturnValue(cwd);
		remoteFiles.clear();
		remoteFiles.set(
			"/etc/dokploy/traefik/dynamic/middlewares.yml",
			"http:\n  middlewares: {}\n",
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it("keeps every router when domains are created concurrently", async () => {
		await Promise.all(keys.map((k) => manageDomain(app, domainFor(k))));

		expect(Object.keys(readConfig().http?.routers ?? {}).sort()).toEqual(
			keys.map((k) => `${appName}-router-${k}`),
		);
	});

	it("removes every router when domains are deleted concurrently", async () => {
		for (const k of keys) await manageDomain(app, domainFor(k));

		await Promise.all(keys.slice(0, 4).map((k) => removeDomain(app, k)));

		expect(Object.keys(readConfig().http?.routers ?? {})).toEqual([
			`${appName}-router-5`,
		]);
	});
});
