import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const state = vi.hoisted(() => ({
	dynamicDir: "",
	cloud: false,
	domains: [] as unknown[],
	uploaded: [] as { certificateData: string; privateKey: string }[],
	traefikRunning: [] as boolean[],
	panel: null as unknown,
	sso: undefined as unknown,
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	reloadDockerResource: vi.fn(),
}));

vi.mock("@dokploy/server/constants", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server/constants")>()),
	get IS_CLOUD() {
		return state.cloud;
	},
	paths: () => ({ DYNAMIC_TRAEFIK_PATH: state.dynamicDir }),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			domains: { findMany: async () => state.domains },
			certificates: { findMany: async () => state.uploaded },
			forwardAuthSettings: { findFirst: async () => state.sso },
		},
	},
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: async () => state.panel,
}));

vi.mock("@dokploy/server/services/settings", () => ({
	reloadDockerResource: state.reloadDockerResource,
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: state.execAsync,
	execAsyncRemote: state.execAsyncRemote,
	sleep: async () => {},
}));

const {
	findShadowedLetsEncryptHosts,
	getShadowedHosts,
	removeShadowedLetsEncryptCertificates,
} = await import("@dokploy/server/services/certificate-conflicts");

let certDir: string;
const pems: Record<string, { certificateData: string; privateKey: string }> =
	{};

const makeCert = (name: string, san: string, extra: string[] = []) => {
	const key = path.join(certDir, `${name}.key`);
	const crt = path.join(certDir, `${name}.crt`);
	execFileSync(
		"openssl",
		[
			"req",
			"-x509",
			"-newkey",
			"rsa:2048",
			"-nodes",
			"-days",
			"30",
			"-keyout",
			key,
			"-out",
			crt,
			"-subj",
			`/CN=${name}`,
			...(san ? ["-addext", `subjectAltName=${san}`] : []),
			...extra,
		],
		{ stdio: "ignore" },
	);
	pems[name] = {
		certificateData: fs.readFileSync(crt, "utf8"),
		privateKey: fs.readFileSync(key, "utf8"),
	};
};

beforeAll(() => {
	certDir = fs.mkdtempSync(path.join(os.tmpdir(), "conflict-certs-"));
	makeCert("exact", "DNS:app.example.com");
	makeCert("wildcard", "DNS:*.example.com");
	makeCert("origin", "DNS:example.com,DNS:*.example.com");
	makeCert("idn", "DNS:xn--bcher-kva.test");
	makeCert("ca", "", ["-addext", "basicConstraints=critical,CA:TRUE"]);
});

afterAll(() => {
	fs.rmSync(certDir, { recursive: true, force: true });
});

const none = (host: string) => ({
	host,
	https: true,
	certificateType: "none" as const,
});

const onServer = (serverId: string | null, organizationId: string) => ({
	serverId,
	environment: { project: { organizationId } },
});

describe("getShadowedHosts", () => {
	const check = (overrides: Partial<Parameters<typeof getShadowedHosts>[0]>) =>
		getShadowedHosts({
			served: [none("app.example.com")],
			uploadedCertificates: [pems.exact!],
			letsEncryptCertificates: [["app.example.com"]],
			...overrides,
		});

	it("flags a host whose uploaded cert competes with a leftover LE cert", () => {
		expect(check({})).toEqual(["app.example.com"]);
	});

	it("matches wildcard uploads one level deep only", () => {
		const uploadedCertificates = [pems.wildcard!];
		expect(check({ uploadedCertificates })).toEqual(["app.example.com"]);
		expect(
			check({
				uploadedCertificates,
				served: [none("example.com")],
				letsEncryptCertificates: [["example.com"]],
			}),
		).toEqual([]);
		expect(
			check({
				uploadedCertificates,
				served: [none("a.b.example.com")],
				letsEncryptCertificates: [["a.b.example.com"]],
			}),
		).toEqual([]);
	});

	it("covers the apex with a Cloudflare Origin style cert", () => {
		expect(
			check({
				uploadedCertificates: [pems.origin!],
				served: [none("example.com")],
				letsEncryptCertificates: [["example.com"]],
			}),
		).toEqual(["example.com"]);
	});

	it("keeps the Let's Encrypt fallback when no upload covers the host", () => {
		expect(check({ uploadedCertificates: [] })).toEqual([]);
		expect(check({ uploadedCertificates: [pems.idn!] })).toEqual([]);
	});

	it("ignores uploads that are expired or not yet valid", () => {
		const inTwoMonths = new Date(Date.now() + 60 * 24 * 3600 * 1000);
		expect(check({ now: inTwoMonths })).toEqual([]);
		expect(check({ now: new Date("2000-01-01") })).toEqual([]);
	});

	it("finds the leaf in a pasted chain that starts with another cert", () => {
		expect(
			check({
				uploadedCertificates: [
					{
						certificateData: `${pems.ca!.certificateData}\n${pems.exact!.certificateData}`,
						privateKey: pems.exact!.privateKey,
					},
				],
			}),
		).toEqual(["app.example.com"]);
	});

	it("keeps the cert while another domain still uses Let's Encrypt", () => {
		expect(
			check({
				served: [
					none("app.example.com"),
					{
						host: "App.Example.com",
						https: true,
						certificateType: "letsencrypt",
					},
				],
			}),
		).toEqual([]);
	});

	it("flags a leftover LE cert next to another resolver without any upload", () => {
		expect(
			check({
				uploadedCertificates: [],
				served: [
					{
						host: "app.example.com",
						https: true,
						certificateType: "custom",
						customCertResolver: "myresolver",
					},
				],
			}),
		).toEqual(["app.example.com"]);
	});

	it("ignores an upload whose private key doesn't match the certificate", () => {
		expect(
			check({
				uploadedCertificates: [
					{
						certificateData: pems.exact!.certificateData,
						privateKey: pems.wildcard!.privateKey,
					},
				],
			}),
		).toEqual([]);
		expect(
			check({
				uploadedCertificates: [
					{
						certificateData: pems.exact!.certificateData,
						privateKey: "not a key",
					},
				],
			}),
		).toEqual([]);
	});

	it("leaves a multi-name LE cert alone while another of its names still needs it", () => {
		const letsEncryptCertificates = [["app.example.com", "shop.example.com"]];
		expect(
			check({
				uploadedCertificates: [pems.wildcard!],
				letsEncryptCertificates,
				served: [
					none("app.example.com"),
					{
						host: "shop.example.com",
						https: true,
						certificateType: "letsencrypt",
					},
				],
			}),
		).toEqual([]);
		expect(
			check({
				uploadedCertificates: [pems.wildcard!],
				letsEncryptCertificates,
				served: [none("app.example.com"), none("shop.example.com")],
			}).sort(),
		).toEqual(["app.example.com", "shop.example.com"]);
	});

	it("treats a custom resolver named letsencrypt as Let's Encrypt", () => {
		expect(
			check({
				served: [
					{
						host: "app.example.com",
						https: true,
						certificateType: "custom",
						customCertResolver: "letsencrypt",
					},
				],
			}),
		).toEqual([]);
	});

	it("skips plain HTTP hosts and hosts without a stored LE cert", () => {
		expect(
			check({ served: [{ ...none("app.example.com"), https: false }] }),
		).toEqual([]);
		expect(check({ letsEncryptCertificates: [["other.example.com"]] })).toEqual(
			[],
		);
	});

	it("compares international and mixed-case hosts the way Traefik stores them", () => {
		expect(
			check({
				served: [none("Bücher.Test")],
				uploadedCertificates: [pems.idn!],
				letsEncryptCertificates: [["xn--bcher-kva.test"]],
			}),
		).toEqual(["xn--bcher-kva.test"]);
	});
});

describe("removeShadowedLetsEncryptCertificates", () => {
	const le = (main: string) => ({
		domain: { main },
		certificate: "c",
		key: "k",
	});
	const original = JSON.stringify({
		letsencrypt: {
			Account: { Email: "a@b.c" },
			Certificates: [le("app.example.com"), le("keep.example.com")],
		},
	});
	const acmeFile = () => path.join(state.dynamicDir, "acme.json");
	const storedHosts = () =>
		JSON.parse(
			fs.readFileSync(acmeFile(), "utf8"),
		).letsencrypt.Certificates.map(
			(c: { domain: { main: string } }) => c.domain.main,
		);

	beforeEach(() => {
		state.dynamicDir = fs.mkdtempSync(path.join(os.tmpdir(), "conflict-acme-"));
		fs.writeFileSync(acmeFile(), original, { mode: 0o600 });
		state.domains = [
			{ ...none("app.example.com"), application: onServer(null, "org-a") },
			{
				host: "keep.example.com",
				https: true,
				certificateType: "letsencrypt",
				application: onServer(null, "org-a"),
			},
		];
		state.uploaded = [pems.exact!];
		state.traefikRunning = [];
		state.panel = null;
		state.sso = undefined;
		state.execAsync.mockReset();
		state.execAsync.mockImplementation(async () => ({
			stdout: (
				state.traefikRunning.length
					? state.traefikRunning.shift()
					: true
			)
				? "abc\n"
				: "",
			stderr: "",
		}));
		state.reloadDockerResource.mockReset();
		state.reloadDockerResource.mockResolvedValue(undefined);
	});

	afterEach(() => {
		fs.rmSync(state.dynamicDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it("removes only the shadowed LE cert, keeps a backup and restarts Traefik", async () => {
		expect(
			await removeShadowedLetsEncryptCertificates(null, undefined, [
				"app.example.com",
			]),
		).toEqual(["app.example.com"]);

		expect(storedHosts()).toEqual(["keep.example.com"]);
		expect(fs.readFileSync(`${acmeFile()}.bak`, "utf8")).toBe(original);
		expect(fs.statSync(acmeFile()).mode & 0o777).toBe(0o600);
		await vi.waitFor(() =>
			expect(state.reloadDockerResource).toHaveBeenCalledWith(
				"dokploy-traefik",
				undefined,
			),
		);
	});

	it("does nothing when there is no conflict", async () => {
		state.uploaded = [];

		expect(
			await removeShadowedLetsEncryptCertificates(null, undefined, [
				"app.example.com",
			]),
		).toEqual([]);
		expect(fs.readFileSync(acmeFile(), "utf8")).toBe(original);
		expect(fs.existsSync(`${acmeFile()}.bak`)).toBe(false);
		expect(state.reloadDockerResource).not.toHaveBeenCalled();
	});

	it("leaves a stopped Traefik stopped", async () => {
		state.traefikRunning = [false];

		expect(
			await removeShadowedLetsEncryptCertificates(null, undefined, [
				"app.example.com",
			]),
		).toEqual(["app.example.com"]);
		expect(storedHosts()).toEqual(["keep.example.com"]);
		expect(state.reloadDockerResource).not.toHaveBeenCalled();
	});

	it("removes the cert again if Traefik wrote it back before restarting", async () => {
		state.reloadDockerResource.mockImplementationOnce(async () => {
			fs.writeFileSync(acmeFile(), original);
		});

		await removeShadowedLetsEncryptCertificates(null, undefined, [
			"app.example.com",
		]);

		await vi.waitFor(() =>
			expect(state.reloadDockerResource).toHaveBeenCalledTimes(2),
		);
		expect(storedHosts()).toEqual(["keep.example.com"]);
	});

	it("restores the backup when Traefik does not come back", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		state.traefikRunning = [true, ...Array(10).fill(false)];

		await removeShadowedLetsEncryptCertificates(null, undefined, [
			"app.example.com",
		]);

		await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
		expect(fs.readFileSync(acmeFile(), "utf8")).toBe(original);
		expect(state.reloadDockerResource).toHaveBeenCalledTimes(2);
	});

	it("only lists and fixes the caller's organization's domains", async () => {
		state.domains.push({
			...none("app.example.com"),
			application: onServer(null, "org-b"),
		});

		expect(await findShadowedLetsEncryptHosts(null, "org-b")).toEqual([
			"app.example.com",
		]);
		state.domains = state.domains.slice(0, -1);
		expect(await findShadowedLetsEncryptHosts(null, "org-b")).toEqual([]);
		expect(
			await removeShadowedLetsEncryptCertificates(null, "org-b", [
				"app.example.com",
			]),
		).toEqual([]);
		expect(fs.readFileSync(acmeFile(), "utf8")).toBe(original);
	});

	it("keeps a cert another organization still uses with Let's Encrypt", async () => {
		state.domains = [
			{ ...none("app.example.com"), application: onServer(null, "org-a") },
			{
				host: "app.example.com",
				https: true,
				certificateType: "letsencrypt",
				application: onServer(null, "org-b"),
			},
		];

		expect(await findShadowedLetsEncryptHosts(null, "org-a")).toEqual([]);
	});

	it("never checks or touches the main server on Cloud", async () => {
		state.cloud = true;
		try {
			expect(await findShadowedLetsEncryptHosts()).toEqual([]);
			expect(
				await removeShadowedLetsEncryptCertificates(null, undefined, [
					"app.example.com",
				]),
			).toEqual([]);
			expect(fs.readFileSync(acmeFile(), "utf8")).toBe(original);
		} finally {
			state.cloud = false;
		}
	});

	it("includes the panel domain and the SSO domain", async () => {
		state.domains = [];
		state.panel = {
			host: "app.example.com",
			https: true,
			certificateType: "none",
		};
		expect(await findShadowedLetsEncryptHosts()).toEqual(["app.example.com"]);

		state.panel = null;
		state.sso = {
			authDomain: "app.example.com",
			https: true,
			certificateType: "none",
			customCertResolver: null,
		};
		expect(await findShadowedLetsEncryptHosts()).toEqual(["app.example.com"]);
	});

	it("restores the backup when the restart command itself fails", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		state.reloadDockerResource.mockRejectedValueOnce(new Error("docker down"));

		await removeShadowedLetsEncryptCertificates(null, undefined, [
			"app.example.com",
		]);

		await vi.waitFor(() =>
			expect(consoleError).toHaveBeenCalledWith(
				"Certificate conflict fix:",
				expect.any(Error),
			),
		);
		expect(fs.readFileSync(acmeFile(), "utf8")).toBe(original);
	});

	it("restores the backup when the second restart fails", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		state.reloadDockerResource
			.mockImplementationOnce(async () => {
				fs.writeFileSync(acmeFile(), original);
			})
			.mockRejectedValueOnce(new Error("docker down"));

		await removeShadowedLetsEncryptCertificates(null, undefined, [
			"app.example.com",
		]);

		await vi.waitFor(() =>
			expect(consoleError).toHaveBeenCalledWith(
				"Certificate conflict fix:",
				expect.any(Error),
			),
		);
		expect(fs.readFileSync(acmeFile(), "utf8")).toBe(original);
	});

	describe("on a remote server", () => {
		beforeEach(() => {
			state.domains = state.domains.map((d) => ({
				...(d as object),
				application: onServer("server-1", "org-a"),
			}));
			state.execAsyncRemote.mockReset();
			state.execAsyncRemote.mockImplementation(
				async (
					_serverId: string,
					command: string,
					_onData: unknown,
					input?: string,
				) => {
					if (command.startsWith("cat > ")) {
						fs.writeFileSync(acmeFile(), input ?? "");
					} else if (command.startsWith("cat ")) {
						const file = command.split(" ")[1]!;
						return {
							stdout: fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "",
							stderr: "",
						};
					} else if (command.startsWith("docker ps")) {
						return {
							stdout:
								state.traefikRunning.length && !state.traefikRunning.shift()
									? ""
									: "abc\n",
							stderr: "",
						};
					}
					return { stdout: "", stderr: "" };
				},
			);
		});

		it("waits for the restart before returning", async () => {
			expect(
				await removeShadowedLetsEncryptCertificates("server-1", undefined, [
					"app.example.com",
				]),
			).toEqual(["app.example.com"]);
			expect(state.reloadDockerResource).toHaveBeenCalledWith(
				"dokploy-traefik",
				"server-1",
			);
			expect(storedHosts()).toEqual(["keep.example.com"]);
		});

		it("reports a failed restart to the caller and restores the backup", async () => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			state.reloadDockerResource.mockRejectedValue(new Error("ssh down"));

			await expect(
				removeShadowedLetsEncryptCertificates("server-1", undefined, [
					"app.example.com",
				]),
			).rejects.toThrow("acme.json was restored");
			expect(fs.readFileSync(acmeFile(), "utf8")).toBe(original);
		});
	});

	it("only removes the hosts the admin confirmed", async () => {
		fs.writeFileSync(
			acmeFile(),
			JSON.stringify({
				letsencrypt: {
					Certificates: [le("app.example.com"), le("shop.example.com")],
				},
			}),
		);
		state.domains = [
			{ ...none("app.example.com"), application: onServer(null, "org-a") },
			{ ...none("shop.example.com"), application: onServer(null, "org-a") },
		];
		state.uploaded = [pems.wildcard!];

		expect(
			await removeShadowedLetsEncryptCertificates(null, undefined, [
				"App.Example.com",
			]),
		).toEqual(["app.example.com"]);
		expect(storedHosts()).toEqual(["shop.example.com"]);
	});

	it("ignores a confirmed host that is not a conflict", async () => {
		expect(
			await removeShadowedLetsEncryptCertificates(null, undefined, [
				"keep.example.com",
			]),
		).toEqual([]);
		expect(fs.readFileSync(acmeFile(), "utf8")).toBe(original);
		expect(state.reloadDockerResource).not.toHaveBeenCalled();
	});

	it("runs one fix at a time per server", async () => {
		const [first, second] = await Promise.all([
			removeShadowedLetsEncryptCertificates(null, undefined, [
				"app.example.com",
			]),
			removeShadowedLetsEncryptCertificates(null, undefined, [
				"app.example.com",
			]),
		]);

		expect(first).toEqual(["app.example.com"]);
		expect(second).toEqual([]);
		expect(state.reloadDockerResource).toHaveBeenCalledTimes(1);
	});
});
