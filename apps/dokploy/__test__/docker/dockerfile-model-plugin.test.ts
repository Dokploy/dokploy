import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync(
	path.resolve(__dirname, "../../../../Dockerfile"),
	"utf8",
);

const PLUGIN_PIN = "docker-model-plugin=1.2.6-1~debian.12~bookworm";
const PLUGIN_VERSION = "1.2.6-1~debian.12~bookworm";

const dockerInstallRun = () => {
	const lines = dockerfile.split("\n");
	const hit = lines.findIndex((line) =>
		line.includes("https://get.docker.com"),
	);
	expect(hit).toBeGreaterThanOrEqual(0);
	let start = hit;
	while (start > 0 && !lines[start]?.startsWith("RUN ")) start--;
	let end = start;
	while (end < lines.length && lines[end]?.endsWith("\\")) end++;
	return lines.slice(start, end + 1).join("\n");
};

describe("Dockerfile docker-model-plugin pin", () => {
	it("pins the plugin in the same RUN as get.docker.com", () => {
		const run = dockerInstallRun();
		expect(run).toContain(PLUGIN_PIN);
		expect(run).toContain("--allow-downgrades");
		expect(run).toContain("--no-install-recommends");
		expect(run.indexOf("get.docker.com")).toBeLessThan(
			run.indexOf("apt-get update"),
		);
		expect(run.indexOf("apt-get update")).toBeLessThan(run.indexOf(PLUGIN_PIN));
	});

	it("asserts the installed dpkg version and a bounded plugin smoke check", () => {
		const run = dockerInstallRun();
		expect(run).toContain(
			"dpkg-query -W -f='${Version}\\n' docker-model-plugin",
		);
		expect(run).toContain(`grep -Fx '${PLUGIN_VERSION}'`);
		expect(run).toContain("timeout -k 5s 15s docker model version");
		expect(run).toContain("rm -rf /var/lib/apt/lists/*");
	});

	it("does not download the plugin from GitHub or run mutating docker model commands", () => {
		expect(dockerfile).not.toMatch(
			/github\.com\/docker\/model-runner|releases\/download/,
		);
		const run = dockerInstallRun();
		for (const cmd of [
			"docker model status",
			"docker model list",
			"docker model ls",
			"docker model inspect",
			"docker model pull",
			"docker model install-runner",
		]) {
			expect(run).not.toContain(cmd);
		}
	});
});
