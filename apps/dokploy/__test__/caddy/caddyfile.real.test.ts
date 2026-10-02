import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CADDY_IMAGE, type CaddyRoute, renderCaddyfile } from "@dokploy/server";
import * as bcrypt from "bcrypt";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

const hasDocker = () => {
	try {
		execFileSync("docker", ["info"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
};

// The same Caddy also plays the applications: each upstream name resolves to
// the container itself, where a site echoes what it received.
const APPS = { open: 3001, secure: 3002, api: 3003 };
let key = 0;
const route = (
	host: string,
	app: keyof typeof APPS,
	overrides: Partial<CaddyRoute> = {},
): CaddyRoute => ({
	host,
	https: false,
	path: null,
	stripPrefix: null,
	addPrefix: null,
	uniqueConfigKey: ++key,
	upstreams: [`${app}:${APPS[app]}`],
	users: [],
	redirects: [],
	...overrides,
});
const redirect = (regex: string, replacement: string) => [
	{ regex, replacement, permanent: true, uniqueConfigKey: ++key },
];

describe.skipIf(!hasDocker())("the rendered Caddyfile in real Caddy", () => {
	let folder = "";
	let container = "";
	let port = 0;
	const docker = (...args: string[]) =>
		execFileSync("docker", args, { encoding: "utf8", timeout: 120000 });
	const send = (
		host: string,
		path = "/",
		options: { method?: string; headers?: Record<string, string> } = {},
	) =>
		new Promise<{ status?: number; location?: string; body: string }>(
			(resolve, reject) => {
				request(
					{
						port,
						path,
						method: options.method,
						headers: { Host: host, ...options.headers },
					},
					(response) => {
						let body = "";
						response.on("data", (chunk) => {
							body += chunk;
						});
						response.on("end", () =>
							resolve({
								status: response.statusCode,
								location: response.headers.location,
								body,
							}),
						);
					},
				)
					.on("error", reject)
					.end();
			},
		);
	const login = (password: string) => ({
		headers: {
			Authorization: `Basic ${Buffer.from(`ops:${password}`).toString("base64")}`,
		},
	});

	beforeAll(async () => {
		const users = [{ username: "ops", hash: bcrypt.hashSync("s3cret", 10) }];
		const toWww = () => redirect("^https?://(?:www.)?(.+)", "https://www.${1}");
		const sameScheme = () =>
			redirect(
				"^http://(?:www\\.)?same\\.test/(.*)",
				"http://www.same.test/$1",
			);
		const { caddyfile } = renderCaddyfile({
			certificates: [],
			routes: [
				route("secure.test", "secure", { users }),
				route("api.test", "api", {
					path: "/api",
					stripPrefix: "/api",
					addPrefix: "/v1",
				}),
				route("case.test", "secure", { path: "/Admin", users }),
				route("case.test", "open", { path: "/admin" }),
				route("canon.test", "open", { redirects: toWww() }),
				route("same.test", "open", { redirects: sameScheme() }),
				route("www.same.test", "open", { redirects: sameScheme() }),
				route("groups.test", "open", {
					redirects: redirect("/old/(\\w+)|/legacy", "/new[$0][$1][$2]"),
				}),
				route("sso.test", "open", { unsupported: "Forward auth" }),
				route("hostile.test", "open", {
					upstreams: ["open:3001\n\trespond pwned"],
				}),
				route("hostile.test", "open", { path: "/ok" }),
			],
		});
		folder = mkdtempSync(join(tmpdir(), "dokploy-caddy-"));
		mkdirSync(join(folder, "sites"));
		writeFileSync(join(folder, "Caddyfile"), caddyfile);
		writeFileSync(
			join(folder, "sites", "apps.caddy"),
			Object.entries(APPS)
				.map(
					([name, listen]) =>
						`http://:${listen} {\n\trespond "${name} saw {uri} authorization=[{header.Authorization}] prefix=[{header.X-Forwarded-Prefix}] real=[{header.X-Real-Ip}] port=[{header.X-Forwarded-Port}]"\n}\n`,
				)
				.join(""),
		);
		const run = [
			...Object.keys(APPS).flatMap((name) => [
				"--add-host",
				`${name}:127.0.0.1`,
			]),
			"-v",
			`${folder}:/etc/caddy`,
			CADDY_IMAGE,
		];
		// The last line of its output is not always the verdict.
		expect(
			docker(
				"run",
				"--rm",
				...run,
				"caddy",
				"validate",
				"--config",
				"/etc/caddy/Caddyfile",
			),
		).toMatch(/^Valid configuration$/m);
		container = docker("run", "-d", "-p", "127.0.0.1::80", ...run).trim();
		port = Number(docker("port", container, "80/tcp").trim().split(":").pop());
		await vi.waitFor(
			async () => expect((await send("nobody.test")).status).toBe(404),
			{ timeout: 20000, interval: 100 },
		);
	}, 180000);

	afterAll(() => {
		if (container) docker("rm", "-f", container);
		if (folder) rmSync(folder, { recursive: true, force: true });
	});

	test("basic auth refuses a missing or wrong password and hides the right one from the app", async () => {
		expect((await send("secure.test")).status).toBe(401);
		expect((await send("secure.test", "/", login("wrong"))).status).toBe(401);
		expect((await send("secure.test", "/", login("s3cret"))).body).toContain(
			"secure saw / authorization=[]",
		);
	});

	test("strip and add prefix keep the query and an encoded slash, as Traefik does", async () => {
		const { body } = await send("api.test", "/api/users?x=1");
		expect(body).toContain("api saw /v1/users?x=1");
		expect(body).toContain("prefix=[/api]");
		expect((await send("api.test", "/api/a%2Fb")).body).toContain(
			"api saw /v1/a%2Fb",
		);
		expect((await send("api.test", "/apifoo")).body).toContain(
			"api saw /v1/foo",
		);
	});

	test("paths that differ only by case stay separate routes", async () => {
		expect((await send("case.test", "/Admin")).status).toBe(401);
		expect((await send("case.test", "/admin")).body).toContain("open saw");
		expect((await send("case.test", "/ADMIN")).status).toBe(404);
	});

	test("a redirect keeps the method, and does nothing when the URL would not change", async () => {
		expect(await send("canon.test", "/x")).toMatchObject({
			status: 301,
			location: "https://www.canon.test/x",
		});
		expect(await send("canon.test", "/x", { method: "POST" })).toMatchObject({
			status: 308,
			location: "https://www.canon.test/x",
		});
		expect(await send("same.test", "/x")).toMatchObject({
			status: 301,
			location: "http://www.same.test/x",
		});
		expect((await send("www.same.test", "/x")).body).toContain("open saw /x");
	});

	test("a redirect template reads the match and its groups as Go does", async () => {
		// What Go's ReplaceAllString returns for the same pattern and URLs:
		// the whole match, its first group, and nothing for a group that the
		// pattern does not have or that did not take part.
		expect((await send("groups.test", "/old/abc/tail?x=1")).location).toBe(
			"http://groups.test/new[/old/abc][abc][]/tail?x=1",
		);
		expect((await send("groups.test", "/legacy/z")).location).toBe(
			"http://groups.test/new[/legacy][][]/z",
		);
		expect((await send("groups.test", "/other")).body).toContain(
			"open saw /other",
		);
	});

	test("what Caddy cannot serve answers 503 in its own place", async () => {
		expect((await send("sso.test")).status).toBe(503);
		expect((await send("hostile.test")).status).toBe(503);
		expect((await send("hostile.test", "/ok")).body).toContain("open saw /ok");
	});

	test("an unknown host and an unclaimed path answer 404", async () => {
		expect((await send("nobody.test")).status).toBe(404);
		expect((await send("api.test", "/other")).status).toBe(404);
	});

	test("forwarding headers the client made up do not reach the app", async () => {
		const { body } = await send("api.test", "/api", {
			headers: { "X-Real-Ip": "203.0.113.7", "X-Forwarded-Port": "9999" },
		});
		expect(body).not.toContain("203.0.113.7");
		// The port Caddy listens on, as Traefik reports its entrypoint's.
		expect(body).toContain("port=[80]");
	});
});
