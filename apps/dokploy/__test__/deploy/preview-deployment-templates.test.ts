import {
	createPreviewTemplateVariables,
	interpolatePreviewTemplate,
	renderPreviewDomain,
} from "@dokploy/server/utils/preview-deployment";
import { parse } from "dotenv";
import { describe, expect, it } from "vitest";

const variables = createPreviewTemplateVariables({
	pullRequestNumber: "42",
	pullRequestTitle: "Fix Login / Redirect",
	branch: "feature/Login_Redirect",
	appName: "My App",
});

describe("preview deployment environment templates", () => {
	it("exposes the pull request number, title, branch and application name", () => {
		expect(variables).toMatchObject({
			pr_num: "42",
			pr_name: "Fix Login / Redirect",
			branch: "feature/Login_Redirect",
			app_name: "My App",
		});
	});

	it("substitutes all supported variables without changing their values", () => {
		expect(
			interpolatePreviewTemplate(
				"PR={pr_num}\nTITLE={pr_name}\nBRANCH={branch}\nAPP={app_name}",
				variables,
				{ escape: true },
			),
		).toBe(
			"PR=42\nTITLE=Fix Login / Redirect\nBRANCH=feature/Login_Redirect\nAPP=My App",
		);
	});

	it("preserves unknown variables and existing shell and Dokploy syntax", () => {
		const template =
			"{unknown} ${pr_num} {{pr_num}} ${{project.VALUE}} ${{environment.VALUE}}";
		expect(
			interpolatePreviewTemplate(template, variables, { escape: true }),
		).toBe(template);
	});

	it("allows a backslash to escape a supported placeholder", () => {
		expect(
			interpolatePreviewTemplate(String.raw`VALUE=\{pr_num}`, variables, {
				escape: true,
			}),
		).toBe("VALUE={pr_num}");
	});

	it("substitutes the rendered preview domain and URL in environment values", () => {
		const domain = renderPreviewDomain(
			"pr-{pr_num}.example.com",
			variables,
			"abc",
		);
		const previewVariables = {
			...variables,
			domain,
			url: `https://${domain}/preview`,
		};
		expect(
			parse(
				interpolatePreviewTemplate(
					"HOST={domain}\nPUBLIC_URL={url}\nCALLBACK={url}/callback",
					previewVariables,
					{ escape: true },
				),
			),
		).toEqual({
			HOST: "pr-42.example.com",
			PUBLIC_URL: "https://pr-42.example.com/preview",
			CALLBACK: "https://pr-42.example.com/preview/callback",
		});
	});

	it("replaces repeated placeholders while keeping escaped occurrences literal", () => {
		expect(
			interpolatePreviewTemplate(
				String.raw`{pr_num}/{pr_num}/\{pr_num}/{pr_num}`,
				variables,
				{ escape: true },
			),
		).toBe("42/42/{pr_num}/42");
	});

	it("decodes a double backslash without a following placeholder", () => {
		expect(
			interpolatePreviewTemplate(String.raw`VALUE='\\'`, variables, {
				escape: true,
			}),
		).toBe(String.raw`VALUE='\'`);
	});

	it("preserves escaped placeholders and regular expressions through dotenv parsing", () => {
		const rendered = interpolatePreviewTemplate(
			String.raw`LITERAL='\{pr_num}'
REGEX='\d+\s*'
PR={pr_num}`,
			variables,
			{ escape: true },
		);
		expect(parse(rendered)).toEqual({
			LITERAL: "{pr_num}",
			REGEX: String.raw`\d+\s*`,
			PR: "42",
		});
	});

	it.each([
		[2, "\\42"],
		[3, "\\{pr_num}"],
		[4, "\\\\42"],
	])("handles %i backslashes before a placeholder", (count, expected) => {
		expect(
			interpolatePreviewTemplate(`${"\\".repeat(count)}{pr_num}`, variables, {
				escape: true,
			}),
		).toBe(expected);
	});

	it("preserves backslashes that do not precede a supported placeholder", () => {
		const template = String.raw`PATH=C:\Users\test\file REGEX=\d+ UNKNOWN=\{unknown}`;
		expect(
			interpolatePreviewTemplate(template, variables, { escape: true }),
		).toBe(template);
	});

	it("does not treat an asterisk in environment values as a wildcard", () => {
		expect(
			interpolatePreviewTemplate("PATTERN=*.js PR={pr_num}", variables, {
				escape: true,
			}),
		).toBe("PATTERN=*.js PR=42");
	});

	it("does not rescan substituted values for placeholders or escapes", () => {
		const nested = createPreviewTemplateVariables({
			pullRequestNumber: "42",
			pullRequestTitle: String.raw`Keep {pr_num} and \{branch} $&`,
			branch: "feature/login",
			appName: "my-app",
		});
		expect(
			interpolatePreviewTemplate("TITLE={pr_name}", nested, { escape: true }),
		).toBe(String.raw`TITLE=Keep {pr_num} and \{branch} $&`);
	});
});

describe("preview deployment domain templates", () => {
	it("preserves the existing wildcard domain behavior", () => {
		expect(
			renderPreviewDomain("*.example.com", variables, "my-app-preview-abc"),
		).toBe("my-app-preview-abc.example.com");
	});

	it("substitutes wildcards embedded in labels alongside variables", () => {
		expect(
			renderPreviewDomain("pr-{pr_num}-*.example.com", variables, "abc"),
		).toBe("pr-42-abc.example.com");
	});

	it("normalizes variable values to hostname labels", () => {
		expect(
			renderPreviewDomain(
				"{app_name}.{branch}.{pr_name}.pr-{pr_num}.example.com",
				variables,
				"abc",
			),
		).toBe(
			"my-app.feature-login-redirect.fix-login-redirect.pr-42.example.com",
		);
	});

	it("uses the pull request number when a title or branch has no ASCII slug", () => {
		const nonAscii = createPreviewTemplateVariables({
			pullRequestNumber: "42",
			pullRequestTitle: "로그인 수정",
			branch: "수정/로그인",
			appName: "my-app",
		});
		expect(
			renderPreviewDomain("{pr_name}.{branch}.example.com", nonAscii, "abc"),
		).toBe("pr-42.pr-42.example.com");
	});

	it("limits an individual variable slug to 63 characters", () => {
		const longTitle = { ...variables, pr_name: "A".repeat(100) };
		expect(renderPreviewDomain("{pr_name}.example.com", longTitle, "abc")).toBe(
			`${"a".repeat(63)}.example.com`,
		);
	});

	it.each([
		"{unknown}.example.com",
		"{pr_num.example.com",
		"https://pr-{pr_num}.example.com",
		"pr-{pr_num}.example.com/path",
		"-pr-{pr_num}.example.com",
		"pr-{pr_num}-.example.com",
		"pr-{pr_num}..example.com",
		"pr_{pr_num}.example.com",
		`${"a".repeat(64)}.example.com`,
	])("rejects invalid rendered hostnames: %s", (template) => {
		expect(() => renderPreviewDomain(template, variables, "abc")).toThrow();
	});

	it("rejects labels that exceed 63 characters after combining variables", () => {
		expect(() =>
			renderPreviewDomain(
				"prefix-{pr_name}.example.com",
				{ ...variables, pr_name: "a".repeat(63) },
				"abc",
			),
		).toThrow();
	});

	it("accepts a hostname of 253 characters and rejects longer hostnames", () => {
		const maximum = [63, 63, 63, 61]
			.map((length) => "a".repeat(length))
			.join(".");
		expect(renderPreviewDomain(maximum, variables, "abc")).toBe(maximum);
		expect(() =>
			renderPreviewDomain(`${maximum}a`, variables, "abc"),
		).toThrow();
	});
});
