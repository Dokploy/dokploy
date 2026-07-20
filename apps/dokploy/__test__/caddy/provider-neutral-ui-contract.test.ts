import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const readSource = (relativePath: string) =>
	readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("provider-neutral Caddy UI contract", () => {
	test("labels the account menu file-browser link as web-server files", () => {
		const source = readSource("../../components/layouts/user-nav.tsx");

		expect(source).toContain("permissions?.traefikFiles.read");
		expect(source).toContain('router.push("/dashboard/traefik")');
		expect(source).toContain("Web Server Files");
		expect(source).not.toMatch(/>\s*Traefik\s*</);
	});

	test("keeps custom-role file-browser permission copy provider-neutral", () => {
		const source = readSource(
			"../../components/proprietary/roles/manage-custom-roles.tsx",
		);

		expect(source).toContain("traefikFiles:");
		expect(source).toContain('label: "Web Server Files"');
		expect(source).toContain(
			'description: "Access to the active web server file browser"',
		);
		expect(source).toContain(
			'description: "View active web server configuration files"',
		);
		expect(source).toContain(
			'description: "Edit and save active web server configuration files"',
		);
		expect(source).not.toContain("Traefik Files");
		expect(source).not.toContain("Traefik file system configuration");
		expect(source).not.toContain("Traefik configuration files");
	});

	test("uses generic copy while active web-server provider is unresolved", () => {
		const actions = readSource(
			"../../components/dashboard/settings/servers/actions/show-traefik-actions.tsx",
		);
		const envEditor = readSource(
			"../../components/dashboard/settings/web-server/edit-web-server-env.tsx",
		);
		const fileSystem = readSource(
			"../../components/dashboard/file-system/show-traefik-system.tsx",
		);

		expect(actions).toContain("EditWebServerEnv");
		expect(actions).not.toContain("EditTraefikEnv");
		expect(envEditor).toContain("readWebServerEnv");
		expect(envEditor).toContain("writeWebServerEnv");
		expect(envEditor).not.toContain("readTraefikEnv");
		expect(envEditor).not.toContain("writeTraefikEnv");
		expect(actions).toContain(': "Web Server";');
		expect(actions).toMatch(
			/const resourceName =[\s\S]*activeProvider === "caddy"[\s\S]*"dokploy-caddy"[\s\S]*activeProvider === "traefik"[\s\S]*"dokploy-traefik"[\s\S]*: null;/,
		);
		expect(actions).toContain("!activeProvider ||");
		expect(actions).toContain("{resourceName && (");
		expect(actions).toContain('activeProvider === "traefik" && (');
		expect(fileSystem).toContain('const isTraefik = provider === "traefik";');
		expect(fileSystem).toContain(
			"Provider-specific edit controls appear after Dokploy resolves the active provider.",
		);
	});

	test("keeps application advanced web-server config provider-neutral while provider is unresolved", () => {
		const source = readSource(
			"../../components/dashboard/application/advanced/traefik/show-traefik-config.tsx",
		);

		expect(source).toContain('const isCaddy = activeProvider === "caddy";');
		expect(source).toContain('const isTraefik = activeProvider === "traefik";');
		expect(source).toContain(': "Web Server";');
		expect(source).toContain(
			"Provider-specific edit controls appear after Dokploy resolves the active provider.",
		);
		expect(source).toContain("{isTraefik && (");
		expect(source).not.toContain('activeProvider !== "caddy"');
		expect(source).not.toContain(
			'activeProvider === "caddy" ? "Caddy" : "Traefik"',
		);
	});

	test("keeps read-only web-server files scrollable", () => {
		const editor = readSource("../../components/shared/code-editor.tsx");
		const fileEditor = readSource(
			"../../components/dashboard/file-system/show-traefik-file.tsx",
		);

		expect(editor).toContain("pointer-events-none absolute");
		expect(fileEditor).toContain(
			'activeProvider === "caddy" ? "json" : "yaml"',
		);
		expect(fileEditor).toContain("disabled={!isTraefik || canEdit}");
	});

	test("keeps Caddy web-server settings cards padded", () => {
		const providerSelector = readSource(
			"../../components/dashboard/settings/web-server/web-server-provider-selector.tsx",
		);
		const migrationPanel = readSource(
			"../../components/dashboard/settings/web-server/caddy-migration-panel.tsx",
		);

		expect(providerSelector).toContain('CardHeader className="pb-3"');
		expect(providerSelector).toContain('CardContent className="space-y-3"');
		expect(migrationPanel).toContain('CardHeader className="pb-3"');
		expect(migrationPanel).toContain('CardContent className="space-y-4"');
		expect(providerSelector).not.toContain('CardHeader className="px-0 pt-0"');
		expect(migrationPanel).not.toContain('CardHeader className="px-0"');
	});
});
