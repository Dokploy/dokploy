import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const readSource = (relativePath: string) =>
	readFileSync(new URL(relativePath, import.meta.url), "utf8");

const compact = (source: string) => source.replace(/\s+/g, " ");

describe("Caddy domain modal UI contract", () => {
	test("wires application domain tab and edit actions through AddDomain", () => {
		const applicationPage = compact(
			readSource(
				"../../pages/dashboard/project/[projectId]/environment/[environmentId]/services/application/[applicationId].tsx",
			),
		);
		const showDomainsSource = readSource(
			"../../components/dashboard/application/domains/show-domains.tsx",
		);
		const showDomains = compact(showDomainsSource);
		const columns = compact(
			readSource("../../components/dashboard/application/domains/columns.tsx"),
		);

		expect(applicationPage).toContain(
			'import { ShowDomains } from "@/components/dashboard/application/domains/show-domains";',
		);
		expect(applicationPage).toContain('<TabsContent value="domains"');
		expect(applicationPage).toContain(
			'<ShowDomains id={applicationId} type="application" />',
		);

		expect(showDomains).toContain(
			'import { AddDomain } from "./handle-domain";',
		);
		expect(showDomains).toContain("<AddDomain id={id} type={type}>");
		expect(showDomainsSource).toMatch(
			/<AddDomain[\s\S]*?id={id}[\s\S]*?type={type}[\s\S]*?domainId={item\.domainId}/,
		);

		expect(columns).toContain('import { AddDomain } from "./handle-domain";');
		expect(columns).toContain(
			"<AddDomain id={id} type={type} domainId={domain.domainId}>",
		);
	});

	test("resolves the active Caddy provider and scopes uploaded certificates", () => {
		const source = readSource(
			"../../components/dashboard/application/domains/handle-domain.tsx",
		);
		const normalized = compact(source);

		expect(source).toMatch(
			/api\.settings\.getActiveWebServerProvider\.useQuery\(\s*\{\s*serverId:\s*application\?\.serverId \|\| undefined\s*\},\s*\{\s*enabled:\s*!!application\s*\}/,
		);
		expect(normalized).toContain(
			'const isCaddyProvider = activeProvider === "caddy";',
		);
		expect(source).toMatch(
			/api\.certificates\.all\.useQuery\(undefined,\s*\{\s*enabled:\s*isOpen && isCaddyProvider,\s*\}\)/,
		);
		expect(normalized).toContain(
			"certificate.serverId === application.serverId",
		);
		expect(normalized).toContain(": !certificate.serverId");
	});

	test("renders Caddy certificate copy and submits uploaded certificate paths", () => {
		const source = readSource(
			"../../components/dashboard/application/domains/handle-domain.tsx",
		);
		const normalized = compact(source);

		for (const expectedCopy of [
			"This server uses Caddy",
			"Caddy route fragments",
			"Caddy can manage HTTPS",
			"Let Caddy manage HTTPS automatically for this host.",
			"Caddy-managed HTTPS (ACME)",
			"Uploaded certificate",
			"Uploaded Certificate",
			"Select an uploaded certificate",
			"Add an uploaded certificate for this server",
		]) {
			expect(source).toContain(expectedCopy);
		}

		expect(normalized).toContain('name="customCertResolver"');
		expect(normalized).toContain("key={certificate.certificateId}");
		expect(normalized).toContain("value={certificate.certificatePath}");
	});

	test("keeps Traefik-only domain controls hidden when Caddy is active", () => {
		const source = readSource(
			"../../components/dashboard/application/domains/handle-domain.tsx",
		);

		expect(source).toMatch(
			/\{!isCaddyProvider && \(\s*<FormField[\s\S]*?name="useCustomEntrypoint"[\s\S]*?Custom Entrypoint/,
		);
		expect(source).toMatch(
			/\{!isCaddyProvider && useCustomEntrypoint && \(\s*<FormField[\s\S]*?name="customEntrypoint"[\s\S]*?Entrypoint Name/,
		);
		expect(source).toMatch(
			/\{!isCaddyProvider && certificateType === "custom" && \(\s*<FormField[\s\S]*?name="customCertResolver"[\s\S]*?Custom Certificate Resolver/,
		);
		expect(source).toMatch(
			/\{!isCaddyProvider && \(\s*<FormField[\s\S]*?name="middlewares"[\s\S]*?Middlewares/,
		);
	});
});
