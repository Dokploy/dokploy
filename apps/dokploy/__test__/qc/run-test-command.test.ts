import { execFileSync } from "node:child_process";
import {
	getTestExecCommand,
	TEST_EXIT_MARKER,
} from "@dokploy/server/utils/builders/run-test-command";
import { describe, expect, test, vi } from "vitest";

vi.mock("@dokploy/server/utils/builders/index", () => ({
	getImageName: async () => "app:latest",
}));

const buildApp = (
	overrides: Record<string, unknown> = {},
): Parameters<typeof getTestExecCommand>[0] =>
	({
		testExecEnabled: true,
		testCommand: "npm test",
		testExecFailurePolicy: "closed",
		...overrides,
	}) as never;

// Runs the generated snippet the way deployApplication does: inside a `set -e`
// subshell, with `docker` replaced by a stub that exits with `dockerExit`.
const runSnippet = (snippet: string, dockerExit: number) => {
	const script = `docker() { echo "stub-docker-output"; return ${dockerExit}; }
(set -e
${snippet}
echo "after-tests")`;
	try {
		const stdout = execFileSync("bash", ["-c", script], { encoding: "utf8" });
		return { stdout, status: 0 };
	} catch (error) {
		const e = error as { stdout: string; status: number };
		return { stdout: e.stdout, status: e.status };
	}
};

describe("getTestExecCommand", () => {
	test("returns an empty string when test-exec is disabled or has no command", async () => {
		expect(
			await getTestExecCommand(buildApp({ testExecEnabled: false }), "dep1"),
		).toBe("");
		expect(
			await getTestExecCommand(buildApp({ testCommand: null }), "dep1"),
		).toBe("");
	});

	test("stays out of the way when the tests come from the QC service", async () => {
		expect(
			await getTestExecCommand(
				buildApp({ testExecSource: "generated" }),
				"dep1",
			),
		).toBe("");
	});

	test("writes the marker and continues when tests fail with the open policy", async () => {
		const snippet = await getTestExecCommand(
			buildApp({ testExecFailurePolicy: "open" }),
			"dep1",
		);
		const { stdout, status } = runSnippet(snippet, 3);
		expect(status).toBe(0);
		expect(stdout).toContain(`${TEST_EXIT_MARKER}:dep1:3`);
		expect(stdout).toContain("after-tests");
	});

	test("writes the marker and aborts with the test exit code under the closed policy", async () => {
		const snippet = await getTestExecCommand(buildApp(), "dep1");
		const { stdout, status } = runSnippet(snippet, 3);
		expect(status).toBe(3);
		expect(stdout).toContain(`${TEST_EXIT_MARKER}:dep1:3`);
		expect(stdout).not.toContain("after-tests");
	});

	test("records exit code 0 when tests pass", async () => {
		const snippet = await getTestExecCommand(buildApp(), "dep1");
		const { stdout, status } = runSnippet(snippet, 0);
		expect(status).toBe(0);
		expect(stdout).toContain(`${TEST_EXIT_MARKER}:dep1:0`);
		expect(stdout).toContain("after-tests");
	});
});
