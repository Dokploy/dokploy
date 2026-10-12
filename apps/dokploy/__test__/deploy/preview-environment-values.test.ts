import { execFileSync } from "node:child_process";
import type { ApplicationNested } from "@dokploy/server/utils/builders";
import { getDockerCommand } from "@dokploy/server/utils/builders/docker-file";
import {
	getEnvironmentVariablesObject,
	prepareEnvironmentVariables,
	prepareEnvironmentVariablesForShell,
} from "@dokploy/server/utils/docker/utils";
import { createPreviewTemplateVariables } from "@dokploy/server/utils/preview-deployment";
import { parse as parseShell } from "shell-quote";
import { describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/filesystem/directory", () => ({
	getBuildAppDirectory: () => "/tmp/preview/Dockerfile",
	getDockerContextPath: () => "/tmp/preview",
}));

const context = (title: string) =>
	createPreviewTemplateVariables({
		pullRequestNumber: "42",
		pullRequestTitle: title,
		branch: "feature/login",
		appName: "preview-app",
	});

describe("preview environment values after dotenv parsing", () => {
	it.each([
		"Fix #42",
		`Fix 'single', "double", and \`backtick\` quotes`,
		String.raw`Keep literal \n and \r sequences`,
		"Keep actual\nnewlines\nand carriage\rreturns",
		"Keep ${{project.VALUE}} and ${{environment.VALUE}} and ${{SELF}} and ${{vault.secret}}",
	])("preserves the raw pull request title %s", (title) => {
		const templates = [
			"UNQUOTED={pr_name}",
			"SINGLE='{pr_name}'",
			'DOUBLE="{pr_name}"',
			"BACKTICK=`{pr_name}`",
		].join("\n");
		expect(
			prepareEnvironmentVariables(templates, "", "", context(title)),
		).toEqual([
			`UNQUOTED=${title}`,
			`SINGLE=${title}`,
			`DOUBLE=${title}`,
			`BACKTICK=${title}`,
		]);
	});

	it("expands existing references before preview variables, including referenced templates", () => {
		const service = [
			"SELF=local-{pr_num}",
			"VALUE=${{project.VALUE}}/${{environment.VALUE}}/${{SELF}}/{pr_name}",
		].join("\n");
		expect(
			prepareEnvironmentVariables(
				service,
				"VALUE=project-{pr_num}",
				"VALUE=environment-{branch}",
				context("Fix #42"),
			),
		).toEqual([
			"SELF=local-42",
			"VALUE=project-42/environment-feature/login/local-42/Fix #42",
		]);
	});

	it("keeps escaped preview tokens literal after dotenv parsing", () => {
		expect(
			prepareEnvironmentVariables(
				String.raw`LITERAL='\{pr_num}'
REGEX='\d+\s*'
REPEATED='{pr_num}/\{pr_num}/{pr_num}'`,
				"",
				"",
				context("Fix #42"),
			),
		).toEqual([
			"LITERAL={pr_num}",
			String.raw`REGEX=\d+\s*`,
			"REPEATED=42/{pr_num}/42",
		]);
	});

	it.each([undefined, context("Fix #42")])(
		"preserves UNC paths and ordinary backslashes with context %j",
		(previewVariables) => {
			const template = String.raw`UNC='\\server\share\file'
WINDOWS='C:\Users\test'
REGEX='\\d+\s*'`;
			expect(
				prepareEnvironmentVariables(template, "", "", previewVariables),
			).toEqual([
				String.raw`UNC=\\server\share\file`,
				String.raw`WINDOWS=C:\Users\test`,
				String.raw`REGEX=\\d+\s*`,
			]);
		},
	);

	it("forwards preview context to shell arguments and runtime environment objects", () => {
		const title = `Fix #42 ' " \n literal\\n \${{project.VALUE}}`;
		const variables = context(title);
		expect(
			prepareEnvironmentVariablesForShell(
				"TITLE={pr_name}",
				"",
				"",
				variables,
			).map((argument) => parseShell(argument)),
		).toEqual([[`TITLE=${title}`]]);
		expect(
			getEnvironmentVariablesObject("TITLE={pr_name}", "", "", variables),
		).toEqual({ TITLE: title });
	});
});

describe("preview shell quoting", () => {
	it("preserves backticks and all quote characters when an actual shell parses arguments", () => {
		const title = "Fix #42 ' \" `\n literal\\n ${{project.VALUE}}";
		const [argument] = prepareEnvironmentVariablesForShell(
			"TITLE={pr_name}",
			"",
			"",
			context(title),
		);
		expect(
			execFileSync("bash", ["-c", `printf '%s' ${argument}`], {
				encoding: "utf8",
			}),
		).toBe(`TITLE=${title}`);
	});
});

describe("Docker preview environment, build arguments and secrets", () => {
	it("carries raw preview values through all three Docker build paths", () => {
		const title = `Fix #42 ' " \n literal\\n \${{project.VALUE}}`;
		const application = {
			appName: "preview-app",
			env: "ENV_TITLE={pr_name}",
			buildArgs: "ARG_TITLE={pr_name}",
			buildSecrets: "SECRET_TITLE={pr_name}",
			createEnvFile: true,
			publishDirectory: null,
			environment: { env: "", project: { env: "" } },
			previewTemplateVariables: context(title),
		} as unknown as ApplicationNested;
		const command = getDockerCommand(application);
		const tokens = parseShell(command);
		const buildArgumentIndex = tokens.indexOf("--build-arg");
		expect(buildArgumentIndex).toBeGreaterThan(-1);
		expect(tokens[buildArgumentIndex + 1]).toBe(`ARG_TITLE=${title}`);
		expect(tokens).toContain(`SECRET_TITLE=${title}`);
		expect(tokens).toContain("type=env,id=SECRET_TITLE");
		const encodedContent = command.match(
			/^echo "([A-Za-z0-9+/=]+)" \| base64 -d/,
		);
		expect(encodedContent).not.toBeNull();
		expect(Buffer.from(encodedContent![1]!, "base64").toString("utf8")).toBe(
			`ENV_TITLE=${title}`,
		);
	});
});
