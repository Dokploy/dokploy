import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { buildComposeOverrideYaml } from "@dokploy/server/utils/builders/compose-remote-build";
import {
	buildRegistryCurlConfig,
	curlConfigQuote,
	getManifestChildDigests,
	getReadFilesCommand,
	getRegistryApiBases,
	isLoopbackHost,
	mapDeploymentTagTimes,
	parseOverrideImages,
	parseRegistryEndpoint,
	parseRegistryImageRef,
	parseRegistryResponses,
	planRepoTags,
	REGISTRY_CURL_COMMAND,
	selectDigestsToDelete,
	splitFileOutput,
} from "@dokploy/server/utils/builders/compose-registry-retention";
import { quote } from "shell-quote";
import { describe, expect, it } from "vitest";

/**
 * Retention for the `dpl-` tags of a compose build registry: the pure part.
 * Which tags and digests may go, how the registry is addressed, and the curl
 * config / command the build server runs. The orchestration is covered by
 * build-server-registry-retention-service.test.ts.
 */

const digest = (n: number) => `sha256:${n.toString(16).padStart(64, "0")}`;

describe("planRepoTags", () => {
	const now = Date.parse("2026-10-07T12:00:00Z");
	const minutesAgo = (m: number) => now - m * 60_000;
	const none = new Set<string>();

	it("keeps everything when there are fewer than five dpl- tags", () => {
		const plan = planRepoTags({
			tags: ["latest", "dpl-a", "dpl-b", "dpl-c"],
			protectedTags: none,
			tagTimes: new Map([
				["dpl-a", minutesAgo(30)],
				["dpl-b", minutesAgo(20)],
				["dpl-c", minutesAgo(10)],
			]),
		});
		expect(plan.doomedTags).toEqual([]);
		expect(plan.keptTags).toEqual(["latest", "dpl-a", "dpl-b", "dpl-c"]);
	});

	it("orders by deployment creation time, not by the tag text", () => {
		// Ids are random: alphabetical order says the opposite of the clock.
		const times = new Map([
			["dpl-zzz", minutesAgo(70)], // oldest
			["dpl-yyy", minutesAgo(60)],
			["dpl-mmm", minutesAgo(50)],
			["dpl-aaa", minutesAgo(40)],
			["dpl-bbb", minutesAgo(30)],
			["dpl-ccc", minutesAgo(20)],
			["dpl-ddd", minutesAgo(10)], // newest
		]);
		const plan = planRepoTags({
			tags: ["latest", ...times.keys()],
			protectedTags: none,
			tagTimes: times,
		});
		// Oldest first, and the two oldest are the alphabetically *last* ones.
		expect(plan.doomedTags).toEqual(["dpl-zzz", "dpl-yyy"]);
		expect(plan.keptTags).toEqual([
			"latest",
			"dpl-mmm",
			"dpl-aaa",
			"dpl-bbb",
			"dpl-ccc",
			"dpl-ddd",
		]);
	});

	it("never dooms latest or any tag that is not a dpl- tag", () => {
		const times = new Map(
			["a", "b", "c", "d", "e", "f"].map((id, index) => [
				`dpl-${id}`,
				minutesAgo(100 - index),
			]),
		);
		const plan = planRepoTags({
			tags: ["latest", "v1", "manual", ...times.keys()],
			protectedTags: none,
			tagTimes: times,
		});
		expect(plan.doomedTags).toEqual(["dpl-a"]);
		expect(plan.keptTags).toEqual(
			expect.arrayContaining(["latest", "v1", "manual"]),
		);
	});

	it("keeps a last-good tag that is older than the five newest", () => {
		const times = new Map(
			["a", "b", "c", "d", "e", "f", "g"].map((id, index) => [
				`dpl-${id}`,
				minutesAgo(100 - index),
			]),
		);
		const plan = planRepoTags({
			tags: ["latest", ...times.keys()],
			// the rollback snapshot still points at the oldest tag
			protectedTags: new Set(["dpl-a"]),
			tagTimes: times,
		});
		expect(plan.doomedTags).toEqual(["dpl-b"]);
		expect(plan.keptTags).toContain("dpl-a");
	});

	it("keeps the tag the current release runs even when its deployment row is gone", () => {
		const times = new Map(
			["b", "c", "d", "e", "f", "g"].map((id, index) => [
				`dpl-${id}`,
				minutesAgo(100 - index),
			]),
		);
		const plan = planRepoTags({
			tags: ["latest", "dpl-old", ...times.keys()],
			protectedTags: new Set(["dpl-old"]),
			tagTimes: times,
		});
		expect(plan.keptTags).toContain("dpl-old");
		expect(plan.doomedTags).toEqual(["dpl-b"]);
	});

	it("ranks tags without a deployment row older than every known one", () => {
		const times = new Map(
			["a", "b", "c"].map((id, index) => [`dpl-${id}`, minutesAgo(30 - index)]),
		);
		const plan = planRepoTags({
			tags: ["latest", "dpl-x", "dpl-y", "dpl-z", "dpl-a", "dpl-b", "dpl-c"],
			protectedTags: none,
			tagTimes: times,
		});
		// 3 known + the 2 unknown that sort last by text fill the five slots
		expect(plan.keptTags).toEqual(
			expect.arrayContaining(["dpl-a", "dpl-b", "dpl-c", "dpl-z", "dpl-y"]),
		);
		expect(plan.doomedTags).toEqual(["dpl-x"]);
	});

	it("does not count a protected tag twice and honors a custom keep", () => {
		const times = new Map(
			["a", "b", "c", "d"].map((id, index) => [
				`dpl-${id}`,
				minutesAgo(100 - index),
			]),
		);
		const plan = planRepoTags({
			tags: [...times.keys()],
			protectedTags: new Set(["dpl-d"]),
			tagTimes: times,
			keep: 2,
		});
		expect(plan.doomedTags).toEqual(["dpl-a", "dpl-b"]);
	});
});

describe("mapDeploymentTagTimes", () => {
	it("maps the tag a deployment pushed to its creation time", () => {
		const times = mapDeploymentTagTimes([
			{ deploymentId: "abc_-X", createdAt: "2026-10-07T10:00:00.000Z" },
			{ deploymentId: "bad", createdAt: "not a date" },
		]);
		expect(times.get("dpl-abc_-X")).toBe(Date.parse("2026-10-07T10:00:00.000Z"));
		expect(times.has("dpl-bad")).toBe(false);
	});
});

describe("selectDigestsToDelete", () => {
	it("keeps a digest that latest (or any kept tag) still resolves to", () => {
		// latest and the newest dpl- tag share a digest; so does an old dpl- tag
		// of a service that did not change.
		const result = selectDigestsToDelete({
			doomedDigests: new Map([
				["dpl-old1", digest(1)],
				["dpl-old2", digest(2)],
			]),
			protectedDigests: new Set([digest(1)]),
		});
		expect(result.deleteDigests).toEqual([digest(2)]);
		expect(result.deleteTags).toEqual(["dpl-old2"]);
		expect(result.heldBack).toEqual([{ tag: "dpl-old1", digest: digest(1) }]);
	});

	it("deletes a digest shared only by doomed tags once", () => {
		const result = selectDigestsToDelete({
			doomedDigests: new Map([
				["dpl-a", digest(7)],
				["dpl-b", digest(7)],
				["dpl-c", digest(8)],
			]),
			protectedDigests: new Set([digest(9)]),
		});
		expect(result.deleteDigests).toEqual([digest(7), digest(8)]);
		expect(result.deleteTags).toEqual(["dpl-a", "dpl-b", "dpl-c"]);
	});

	it("protects every doomed tag of a digest when one kept tag shares it", () => {
		const result = selectDigestsToDelete({
			doomedDigests: new Map([
				["dpl-a", digest(7)],
				["dpl-b", digest(7)],
			]),
			protectedDigests: new Set([digest(7)]),
		});
		expect(result.deleteDigests).toEqual([]);
		expect(result.heldBack).toHaveLength(2);
	});
});

describe("getManifestChildDigests", () => {
	it("lists the children of an index and nothing for a plain manifest", () => {
		expect(
			getManifestChildDigests(
				JSON.stringify({
					manifests: [{ digest: digest(3) }, { digest: "bogus" }, {}],
				}),
			),
		).toEqual([digest(3)]);
		expect(
			getManifestChildDigests(JSON.stringify({ layers: [], config: {} })),
		).toEqual([]);
		expect(getManifestChildDigests("not json")).toEqual([]);
	});
});

describe("image references", () => {
	it("splits registry, repository and tag", () => {
		expect(parseRegistryImageRef("localhost:5000/acme/my-app-web:dpl-x1")).toEqual(
			{ host: "localhost:5000", repo: "acme/my-app-web", tag: "dpl-x1" },
		);
		expect(parseRegistryImageRef("Reg.Example.com/acme/a:latest")).toEqual({
			host: "reg.example.com",
			repo: "acme/a",
			tag: "latest",
		});
	});

	it("rejects references that are not host/repo:tag", () => {
		expect(parseRegistryImageRef("nginx:latest")).toBeNull();
		expect(parseRegistryImageRef("acme/app")).toBeNull();
		expect(parseRegistryImageRef("reg.io/acme/app@sha256:abc")).toBeNull();
		expect(parseRegistryImageRef("reg.io/a b/app:t")).toBeNull();
		expect(parseRegistryImageRef("")).toBeNull();
	});

	it("reads the images out of a generated override", () => {
		const yaml = buildComposeOverrideYaml(
			[
				{ service: "web", image: "localhost:5000/acme/app-web:dpl-1" },
				{ service: "api", image: "localhost:5000/acme/app-api:dpl-1" },
			],
			"docker-compose",
		);
		expect(parseOverrideImages(yaml)).toEqual([
			"localhost:5000/acme/app-web:dpl-1",
			"localhost:5000/acme/app-api:dpl-1",
		]);
		expect(parseOverrideImages("::: not yaml :::\n\t- [")).toEqual([]);
		expect(parseOverrideImages("")).toEqual([]);
	});
});

describe("registry addressing", () => {
	it("tries http then https for a loopback (tunnelled) registry", () => {
		expect(getRegistryApiBases(parseRegistryEndpoint("localhost:5000")!)).toEqual(
			["http://localhost:5000", "https://localhost:5000"],
		);
		expect(isLoopbackHost("127.0.0.1:5000")).toBe(true);
		expect(isLoopbackHost("[::1]:5000")).toBe(true);
	});

	it("never sends credentials over plain http to a remote host unless asked to", () => {
		expect(
			getRegistryApiBases(parseRegistryEndpoint("reg.example.com")!),
		).toEqual(["https://reg.example.com"]);
		expect(
			getRegistryApiBases(parseRegistryEndpoint("http://reg.internal:5000/")!),
		).toEqual(["http://reg.internal:5000"]);
		expect(isLoopbackHost("reg.example.com")).toBe(false);
	});

	it("rejects an empty or hostile registry url", () => {
		expect(parseRegistryEndpoint("")).toBeNull();
		expect(parseRegistryEndpoint(null)).toBeNull();
		expect(parseRegistryEndpoint('reg" --evil')).toBeNull();
	});
});

describe("curl config and command", () => {
	const password = 'p"a\\ss$`word;|&';

	it("puts the password in the stdin config only, never in the command", () => {
		const config = buildRegistryCurlConfig({
			requests: [{ id: 0, method: "GET", url: "http://localhost:5000/v2/" }],
			username: "ci",
			password,
		});
		expect(config).toContain('user = "ci:p\\"a\\\\ss$`word;|&"');
		expect(REGISTRY_CURL_COMMAND).not.toContain(password);
		expect(REGISTRY_CURL_COMMAND).toContain("--config -");
		expect(REGISTRY_CURL_COMMAND).not.toMatch(/(--user|-u )/);
	});

	it("builds one block per request with the right options", () => {
		const config = buildRegistryCurlConfig({
			requests: [
				{ id: 0, method: "HEAD", url: "http://r/v2/a/manifests/t", manifest: true },
				{
					id: 1,
					method: "GET",
					url: "http://r/v2/a/manifests/u",
					manifest: true,
					includeHeaders: true,
				},
				{ id: 2, method: "DELETE", url: "http://r/v2/a/manifests/sha256:x" },
			],
			username: "ci",
			password: "pw",
		});
		const blocks = config.trim().split("\nnext\n");
		expect(blocks).toHaveLength(3);
		expect(blocks[0]).toMatch(/^head$/m);
		expect(blocks[0]).toContain("Accept: application/vnd.docker.distribution.manifest.v2+json");
		expect(blocks[1]).toMatch(/^include$/m);
		expect(blocks[2]).toContain('request = "DELETE"');
		expect(blocks[2]).not.toContain("Accept");
		for (const [id, block] of blocks.entries()) {
			expect(block).toContain(`@@DPL ${id} %{http_code}`);
		}
	});

	it("omits credentials for an anonymous registry", () => {
		const config = buildRegistryCurlConfig({
			requests: [{ id: 0, method: "GET", url: "http://r/v2/" }],
			username: "",
			password: "",
		});
		expect(config).not.toContain("user =");
	});

	it("refuses values with line breaks", () => {
		expect(() => curlConfigQuote("a\nb")).toThrow();
		expect(() =>
			buildRegistryCurlConfig({
				requests: [{ id: 0, method: "GET", url: "http://r/v2/" }],
				username: "ci",
				password: "line1\nline2",
			}),
		).toThrow();
	});

	it("parses responses by request id", () => {
		const out = [
			'{"tags":["a"]}',
			"@@DPL 0 200",
			`HTTP/1.1 200 OK\r\nDocker-Content-Digest: ${digest(1)}\r\nContent-Type: x\r\n\r\n`,
			"@@DPL 1 200",
			`HTTP/1.1 200 OK\r\nDocker-Content-Digest: ${digest(2)}\r\n\r\n{"manifests":[]}`,
			"@@DPL 2 200",
			"",
			"@@DPL 3 000",
			"",
		].join("\n");
		const responses = parseRegistryResponses(out);
		expect(responses.get(0)).toMatchObject({ status: 200, body: '{"tags":["a"]}' });
		expect(responses.get(1)?.headers["docker-content-digest"]).toBe(digest(1));
		expect(responses.get(1)?.body).toBe("");
		expect(responses.get(2)?.headers["docker-content-digest"]).toBe(digest(2));
		expect(responses.get(2)?.body).toBe('{"manifests":[]}');
		expect(responses.get(3)?.status).toBe(0);
	});

	it("reads the override files back by marker", () => {
		const command = getReadFilesCommand([quote(["/a b/one"]), quote(["/two"])]);
		expect(command).toContain("'/a b/one'");
		expect(
			splitFileOutput("@@DPL-FILE /one\nservices: {}\n\n@@DPL-FILE /two\n\n"),
		).toEqual(["services: {}", ""]);
	});
});

// The same config and parser against real curl and a registry-shaped http
// server: proves the syntax curl is fed, the stdin config, basic auth and the
// write-out markers, none of which a hand-written fake can.
const hasCurl = spawnSync("curl", ["--version"]).status === 0;

describe.skipIf(!hasCurl)("against real curl", () => {
	it("round-trips auth, HEAD, GET with headers, and DELETE", async () => {
		const password = 'wi"ld\\pass';
		const seen: { method?: string; url?: string; authorization?: string }[] = [];
		const server = createServer((req, res) => {
			seen.push({
				method: req.method,
				url: req.url,
				authorization: req.headers.authorization,
			});
			const expected = `Basic ${Buffer.from(`ci:${password}`).toString("base64")}`;
			if (req.headers.authorization !== expected) {
				res.writeHead(401).end();
				return;
			}
			if (req.url === "/v2/") {
				res.writeHead(200).end("{}");
			} else if (req.url?.startsWith("/v2/acme/app/tags/list")) {
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify({ name: "acme/app", tags: ["latest", "dpl-a"] }));
			} else if (req.method === "DELETE") {
				res.writeHead(405).end();
			} else if (req.url?.startsWith("/v2/acme/app/manifests/")) {
				res.writeHead(200, {
					"Docker-Content-Digest": digest(5),
					"content-type": "application/vnd.docker.distribution.manifest.v2+json",
					...(req.headers.accept?.includes("manifest.v2+json")
						? {}
						: { "x-no-accept": "1" }),
				});
				res.end(req.method === "HEAD" ? undefined : '{"schemaVersion":2}');
			} else {
				res.writeHead(404).end();
			}
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		try {
			const config = buildRegistryCurlConfig({
				requests: [
					{ id: 0, method: "GET", url: `${base}/v2/` },
					{ id: 1, method: "GET", url: `${base}/v2/acme/app/tags/list?n=1000` },
					{
						id: 2,
						method: "HEAD",
						url: `${base}/v2/acme/app/manifests/dpl-a`,
						manifest: true,
					},
					{
						id: 3,
						method: "GET",
						url: `${base}/v2/acme/app/manifests/latest`,
						manifest: true,
						includeHeaders: true,
					},
					{ id: 4, method: "DELETE", url: `${base}/v2/acme/app/manifests/${digest(5)}` },
					{ id: 5, method: "GET", url: "http://127.0.0.1:1/v2/" },
				],
				username: "ci",
				password,
			});
			// async: the fake registry runs in this very process
			const result = await new Promise<{ stdout: Buffer }>((resolve, reject) => {
				const child = spawn("curl", ["--config", "-"]);
				const chunks: Buffer[] = [];
				child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
				child.on("error", reject);
				child.on("close", () => resolve({ stdout: Buffer.concat(chunks) }));
				child.stdin.end(config);
			});
			// (exit status is non-zero because the last request cannot connect; the
			// build-server command ends in `exit 0` for exactly that reason)
			const responses = parseRegistryResponses(result.stdout.toString());
			expect(responses.get(0)?.status).toBe(200);
			expect(JSON.parse(responses.get(1)?.body ?? "{}").tags).toEqual([
				"latest",
				"dpl-a",
			]);
			expect(responses.get(2)?.headers["docker-content-digest"]).toBe(digest(5));
			expect(responses.get(2)?.headers["x-no-accept"]).toBeUndefined();
			expect(responses.get(3)?.headers["docker-content-digest"]).toBe(digest(5));
			expect(responses.get(3)?.body).toBe('{"schemaVersion":2}');
			expect(responses.get(4)?.status).toBe(405);
			expect(responses.get(5)?.status).toBe(0);
			// the password only ever travelled as an Authorization header
			expect(seen.every((entry) => entry.authorization)).toBe(true);
			expect(result.stdout.toString()).not.toContain(password);
		} finally {
			server.close();
		}
	});
});
