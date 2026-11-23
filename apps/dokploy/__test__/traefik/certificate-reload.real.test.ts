import { execFileSync, execSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const REAL_TEST_TIMEOUT = 120000;
const CONTAINER = "dokploy-test-certificate-reload";
const HOST = "certificate-reload.test";

const state = vi.hoisted(() => ({
	dynamicDir: "",
	row: null as Record<string, unknown> | null,
}));

vi.mock("@dokploy/server/constants", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server/constants")>()),
	paths: () => ({
		DYNAMIC_TRAEFIK_PATH: state.dynamicDir,
		CERTIFICATES_PATH: path.join(state.dynamicDir, "certificates"),
	}),
}));

vi.mock("@dokploy/server/db", () => {
	const returning = (update: (row: Record<string, unknown>) => void) => ({
		returning: async () => {
			update(state.row!);
			return [state.row];
		},
	});
	return {
		db: {
			query: { certificates: { findFirst: async () => state.row } },
			insert: () => ({
				values: (values: Record<string, unknown>) =>
					returning(() => {
						state.row = {
							certificateId: "cert-reload",
							certificatePath: "certificate-reload",
							serverId: null,
							...values,
						};
					}),
			}),
			update: () => ({
				set: (values: Record<string, unknown>) => ({
					where: () =>
						returning(() => {
							state.row = { ...state.row, ...values };
						}),
				}),
			}),
			delete: () => ({ where: () => returning(() => {}) }),
		},
	};
});

const { createCertificate, updateCertificate, removeCertificateById } =
	await import("@dokploy/server/services/certificate");
const { TRAEFIK_VERSION } = await import("@dokploy/server/setup/traefik-setup");

const hasTools = () => {
	try {
		execSync("docker info", { stdio: "ignore" });
		execSync("openssl version", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
};

const generateCertificate = (dir: string, name: string) => {
	execFileSync(
		"openssl",
		[
			"req",
			"-x509",
			"-newkey",
			"rsa:2048",
			"-nodes",
			"-days",
			"1",
			"-keyout",
			path.join(dir, `${name}.key`),
			"-out",
			path.join(dir, `${name}.crt`),
			"-subj",
			`/CN=${HOST}`,
			"-addext",
			`subjectAltName=DNS:${HOST}`,
		],
		{ stdio: "ignore" },
	);
	const certificateData = fs.readFileSync(
		path.join(dir, `${name}.crt`),
		"utf8",
	);
	return {
		certificateData,
		privateKey: fs.readFileSync(path.join(dir, `${name}.key`), "utf8"),
		fingerprint: new X509Certificate(certificateData).fingerprint256,
	};
};

const servedFingerprint = (port: number) =>
	new Promise<string>((resolve) => {
		const socket = tls.connect(
			{ host: "127.0.0.1", port, servername: HOST, rejectUnauthorized: false },
			() => {
				resolve(socket.getPeerCertificate().fingerprint256);
				socket.end();
			},
		);
		socket.on("error", () => resolve(""));
	});

const waitForFingerprint = async (
	port: number,
	matches: (fingerprint: string) => boolean,
	timeoutMs = 15000,
) => {
	const deadline = Date.now() + timeoutMs;
	let fingerprint = "";
	while (Date.now() < deadline) {
		fingerprint = await servedFingerprint(port);
		if (matches(fingerprint)) return fingerprint;
		await new Promise((r) => setTimeout(r, 250));
	}
	return fingerprint;
};

const removeContainer = () =>
	execSync(`docker rm -f ${CONTAINER}`, { stdio: "ignore" });

describe.skipIf(!hasTools() || !process.env.CI)(
	"certificate changes are served by a running Traefik (real docker)",
	() => {
		let root: string;
		let port: number;
		let v1: ReturnType<typeof generateCertificate>;
		let v2: ReturnType<typeof generateCertificate>;
		let defaultFingerprint: string;

		beforeAll(async () => {
			root = fs.realpathSync(
				fs.mkdtempSync(path.join(os.tmpdir(), "certificate-reload-")),
			);
			state.dynamicDir = path.join(root, "dynamic");
			fs.mkdirSync(path.join(state.dynamicDir, "certificates"), {
				recursive: true,
			});
			fs.writeFileSync(
				path.join(state.dynamicDir, "router.yml"),
				[
					"http:",
					"  routers:",
					`    reload: { rule: "Host(\`${HOST}\`)", entryPoints: [websecure], service: reload, tls: {} }`,
					"  services:",
					'    reload: { loadBalancer: { servers: [ { url: "http://127.0.0.1:9" } ] } }',
				].join("\n"),
			);
			v1 = generateCertificate(root, "v1");
			v2 = generateCertificate(root, "v2");

			try {
				removeContainer();
			} catch {}
			execSync(
				[
					`docker run -d --name ${CONTAINER} -p 127.0.0.1::443`,
					`-v ${state.dynamicDir}:${state.dynamicDir}`,
					`traefik:v${TRAEFIK_VERSION}`,
					"--entryPoints.websecure.address=:443",
					`--providers.file.directory=${state.dynamicDir}`,
					"--providers.file.watch=true",
				].join(" "),
				{ stdio: "ignore" },
			);
			port = Number(
				execSync(`docker port ${CONTAINER} 443/tcp`)
					.toString()
					.trim()
					.split(":")
					.pop(),
			);
			defaultFingerprint = await waitForFingerprint(port, (f) => f !== "");
		}, REAL_TEST_TIMEOUT);

		afterAll(() => {
			try {
				removeContainer();
			} catch {}
			fs.rmSync(root, { recursive: true, force: true });
		});

		it(
			"serves a created, updated and deleted certificate without restarting Traefik",
			async () => {
				expect(defaultFingerprint).not.toBe("");
				expect(defaultFingerprint).not.toBe(v1.fingerprint);

				await createCertificate(
					{
						name: "reload",
						certificateData: v1.certificateData,
						privateKey: v1.privateKey,
						organizationId: "org",
					},
					"org",
				);
				expect(
					await waitForFingerprint(port, (f) => f === v1.fingerprint),
				).toBe(v1.fingerprint);

				await updateCertificate("cert-reload", {
					certificateData: v2.certificateData,
					privateKey: v2.privateKey,
				});
				expect(
					await waitForFingerprint(port, (f) => f === v2.fingerprint),
				).toBe(v2.fingerprint);

				await removeCertificateById("cert-reload");
				const afterDelete = await waitForFingerprint(
					port,
					(f) => f !== "" && f !== v2.fingerprint,
				);
				expect(afterDelete).not.toBe(v2.fingerprint);
				expect(afterDelete).not.toBe("");
			},
			REAL_TEST_TIMEOUT,
		);
	},
);
