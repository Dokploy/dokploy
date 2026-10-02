import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	certificateBundle,
	switchToCaddyScript,
	switchToTraefikScript,
} from "@dokploy/server/utils/caddy/cutover";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasOpenSsl, issueCertificate } from "./certificate";

describe.skipIf(!hasOpenSsl())("certificateBundle", () => {
	const issue = (names: string[], days?: number) => {
		const { certificate, key } = issueCertificate(names, days);
		return {
			certificate: Buffer.from(certificate).toString("base64"),
			key: Buffer.from(key).toString("base64"),
		};
	};

	it("carries valid certificates, one line per name, and leaves the rest", () => {
		const single = issue(["carry.test"]);
		const acme = {
			letsencrypt: {
				Certificates: [
					{ domain: { main: "carry.test" }, ...single },
					{
						domain: { main: "a.test", sans: ["B.test"] },
						...issue(["a.test", "B.test"]),
					},
					{ domain: { main: "*.wild.test" }, ...issue(["*.wild.test"]) },
					{
						domain: { main: "wrong-key.test" },
						...issue(["wrong-key.test"]),
						key: single.key,
					},
					// Valid for one day: carried today, left out once it has expired.
					{ domain: { main: "old.test" }, ...issue(["old.test"], 1) },
				],
			},
		};
		const names = (now?: Date) =>
			certificateBundle(JSON.stringify(acme), now)
				.split("\n")
				.map((line) => line.split(" ")[0]?.split("/").pop());
		expect(names()).toEqual(["carry.test", "a.test", "b.test", "old.test"]);
		expect(names(new Date(Date.now() + 2 * 86400000))).toEqual([
			"carry.test",
			"a.test",
			"b.test",
		]);
		expect(certificateBundle("{}")).toBe("");
	});
});

// Docker, reduced to what the switch scripts ask of it. A container is a few
// files: its status, its restart policy, its restart count and its networks.
const DOCKER = `#!/bin/sh
get() { cat "$STATE/$1.$2" 2>/dev/null; }
put() { printf %s "$3" > "$STATE/$1.$2"; }
exists() { [ -e "$STATE/$1.status" ]; }
case "$1" in
inspect)
	if [ "$2" != -f ]; then exists "$2"; exit; fi
	exists "$4" || exit 1
	case "$3" in
	*RestartCount*) echo "$(get "$4" status) $(get "$4" count)" ;;
	*Networks*) get "$4" networks ;;
	*) get "$4" status ;;
	esac ;;
update) exists "$4" && [ ! -e "$STATE/locked-$4" ] && put "$4" restart "$3" ;;
stop) exists "$2" && put "$2" status exited ;;
start)
	exists "$2" || exit 1
	if [ -e "$STATE/crashes-$2" ]; then put "$2" status restarting; put "$2" count 1
	else put "$2" status running; put "$2" count 0; fi ;;
rm) rm -f "$STATE/$3".* ;;
create) put "$3" status created; put "$3" restart no; put "$3" networks "$5 " ;;
exec) [ "$(get "$2" status)" = running ] ;;
network) put "$4" networks "$(get "$4" networks)$3 " ;;
image) [ -e "$STATE/image" ] ;;
pull) : > "$STATE/image" ;;
esac
`;

describe("the switch scripts", () => {
	const CADDY = "dokploy-caddy";
	const TRAEFIK = "dokploy-traefik";
	let folder = "";
	let caddyPath = "";
	let state = "";

	beforeEach(() => {
		folder = mkdtempSync(join(tmpdir(), "dokploy-switch-"));
		caddyPath = join(folder, "folder with spaces");
		state = join(folder, "state");
		mkdirSync(join(caddyPath, "data"), { recursive: true });
		mkdirSync(state);
		mkdirSync(join(folder, "bin"));
		writeFileSync(join(folder, "bin/docker"), DOCKER, { mode: 0o755 });
		writeFileSync(join(folder, "bin/sleep"), "#!/bin/sh\n", { mode: 0o755 });
	});
	afterEach(() => rmSync(folder, { recursive: true, force: true }));

	const put = (file: string, content = "") =>
		writeFileSync(join(state, file), content);
	const container = (name: string, status: string, restart: string) => {
		put(`${name}.status`, status);
		put(`${name}.restart`, restart);
		put(`${name}.count`, "0");
		put(`${name}.networks`, "dokploy-network isolated ");
	};
	const read = (file: string) => readFileSync(join(state, file), "utf8");
	const containers = () =>
		Object.fromEntries(
			[CADDY, TRAEFIK].map((name) => [
				name,
				existsSync(join(state, `${name}.status`))
					? `${read(`${name}.status`)} ${read(`${name}.restart`)}`
					: "gone",
			]),
		);
	const run = (script: typeof switchToCaddyScript) => {
		const options = {
			image: "caddy:2.11.4",
			caddy: CADDY,
			traefik: TRAEFIK,
			network: "dokploy-network",
			publish: ["80:80", "443:443", "443:443/udp"],
			caddyPath,
			certificatesPath: "/certificates",
		};
		const { status, stdout, stderr } = spawnSync(
			"sh",
			["-c", script(options)],
			{
				encoding: "utf8",
				env: {
					NODE_ENV: "test",
					PATH: `${join(folder, "bin")}:/usr/bin:/bin`,
					STATE: state,
				},
			},
		);
		return { status, stdout: stdout.trim(), stderr: stderr.trim() };
	};

	it("to Caddy: swaps the proxies, joins Traefik's networks, unpacks the certificates", () => {
		container(TRAEFIK, "running", "always");
		const text = (value: string) => Buffer.from(value).toString("base64");
		// No newline after the last line, as certificateBundle leaves it.
		writeFileSync(
			join(caddyPath, "data/certificates.import"),
			["a.test", "b.test"]
				.map(
					(name) => `store/${name} ${text(`for ${name}`)} ${text("key")} e30=`,
				)
				.join("\n"),
		);
		expect(run(switchToCaddyScript)).toEqual({
			status: 0,
			stdout: "Caddy is serving",
			stderr: "",
		});
		expect(containers()).toEqual({
			[CADDY]: "running always",
			[TRAEFIK]: "exited no",
		});
		expect(read(`${CADDY}.networks`)).toBe("dokploy-network isolated ");
		expect(
			readFileSync(join(caddyPath, "data/store/b.test/b.test.crt"), "utf8"),
		).toBe("for b.test");
		expect(existsSync(join(caddyPath, "data/certificates.import"))).toBe(false);
		expect(existsSync(join(caddyPath, "sites/custom.caddy"))).toBe(true);
		expect(existsSync(join(caddyPath, "switching"))).toBe(false);
	});

	it("to Caddy: puts Traefik back when Caddy exits at start", () => {
		container(TRAEFIK, "running", "always");
		put(`crashes-${CADDY}`);
		const { status, stderr } = run(switchToCaddyScript);
		expect(status).toBe(1);
		expect(stderr).toBe("Caddy did not start, so Traefik is serving again");
		expect(containers()).toEqual({
			[CADDY]: "gone",
			[TRAEFIK]: "running always",
		});
	});

	it("to Caddy: only sets the restart policies when Caddy already serves", () => {
		container(CADDY, "running", "no");
		container(TRAEFIK, "exited", "always");
		expect(run(switchToCaddyScript).stdout).toBe("Caddy is already serving");
		expect(containers()).toEqual({
			[CADDY]: "running always",
			[TRAEFIK]: "exited no",
		});
	});

	it("to Traefik: swaps the proxies", () => {
		container(CADDY, "running", "always");
		container(TRAEFIK, "exited", "no");
		expect(run(switchToTraefikScript)).toEqual({
			status: 0,
			stdout: "Traefik is serving",
			stderr: "",
		});
		expect(containers()).toEqual({
			[CADDY]: "exited no",
			[TRAEFIK]: "running always",
		});
	});

	it.each([
		[
			"Traefik exits at start",
			`crashes-${TRAEFIK}`,
			"Traefik did not start, so Caddy is serving again",
		],
		[
			"Caddy keeps its restart policy",
			`locked-${CADDY}`,
			`could not change the restart policy of ${CADDY}`,
		],
	])("to Traefik: puts Caddy back when %s", (_, flag, message) => {
		container(CADDY, "running", "always");
		container(TRAEFIK, "exited", "no");
		put(flag);
		const { status, stderr } = run(switchToTraefikScript);
		expect(status).toBe(1);
		expect(stderr).toBe(message);
		expect(containers()).toEqual({
			[CADDY]: "running always",
			[TRAEFIK]: "exited no",
		});
	});

	it("to Traefik: reports a Traefik container that is gone, with Caddy stopped", () => {
		container(CADDY, "running", "always");
		expect(run(switchToTraefikScript).stdout).toBe("missing");
		expect(containers()).toEqual({ [CADDY]: "exited no", [TRAEFIK]: "gone" });
	});

	it("to Traefik: starts Traefik when the Caddy container is gone", () => {
		container(TRAEFIK, "exited", "no");
		expect(run(switchToTraefikScript).stdout).toBe("Traefik is serving");
		expect(containers()).toEqual({
			[CADDY]: "gone",
			[TRAEFIK]: "running always",
		});
	});
});
