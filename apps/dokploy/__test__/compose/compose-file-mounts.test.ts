import { describe, expect, it } from "vitest";

const quote = (args: string[]) => args.map((a) => `'${a}'`).join(" ");

interface Mount {
	type: "file" | "volume" | "bind";
	filePath?: string | null;
	content?: string | null;
}

export const encodeBase64 = (content: string) =>
	Buffer.from(content, "utf-8").toString("base64");

export const generateCreateMountsCommand = (
	_appName: string,
	baseFilesPath: string,
	mounts: Mount[],
) => {
	const fileMounts = (mounts || []).filter(
		(m) => m.type === "file" && m.filePath,
	);

	if (fileMounts.length === 0) {
		return "";
	}

	let commands = `mkdir -p ${quote([baseFilesPath])};\n`;

	for (const mount of fileMounts) {
		const cleanPath = (mount.filePath || "").trim().replace(/^[/\\]+/, "");
		if (!cleanPath) continue;

		const fullPath = `${baseFilesPath}/${cleanPath}`;
		const lastSlash = fullPath.lastIndexOf("/");
		const directory =
			lastSlash > 0 ? fullPath.substring(0, lastSlash) : baseFilesPath;
		const encodedContent = encodeBase64(mount.content || "");

		commands += `
			mkdir -p ${quote([directory])};
			if [ -d ${quote([fullPath])} ]; then rm -rf ${quote([fullPath])}; fi;
			echo "${encodedContent}" | base64 -d > ${quote([fullPath])};
		`;
	}

	return commands;
};

export const sanitizeFilePath = (filePath: string): string => {
	return filePath.trim().replace(/^[/\\]+/, "");
};

describe("Compose File-Type Mounts Materialization (#5292)", () => {
	const appName = "supabase-stack";
	const baseFilesPath = `/etc/dokploy/compose/${appName}/files`;

	describe("generateCreateMountsCommand", () => {
		it("returns empty string when there are no mounts", () => {
			const cmd = generateCreateMountsCommand(appName, baseFilesPath, []);
			expect(cmd).toBe("");
		});

		it("returns empty string when there are only volume mounts", () => {
			const mounts: Mount[] = [
				{ type: "volume", filePath: "db-data" },
				{ type: "bind", filePath: "/var/run/docker.sock" },
			];
			const cmd = generateCreateMountsCommand(appName, baseFilesPath, mounts);
			expect(cmd).toBe("");
		});

		it("generates file materialization with stale directory cleanup for file mounts", () => {
			const mounts: Mount[] = [
				{
					type: "file",
					filePath: "init.sql",
					content: "CREATE TABLE users (id SERIAL PRIMARY KEY);",
				},
				{
					type: "file",
					filePath: "config/app.conf",
					content: "listen = 8080",
				},
			];

			const cmd = generateCreateMountsCommand(appName, baseFilesPath, mounts);
			expect(cmd).toContain(`mkdir -p '${baseFilesPath}'`);
			expect(cmd).toContain(
				`if [ -d '/etc/dokploy/compose/supabase-stack/files/init.sql' ]; then rm -rf '/etc/dokploy/compose/supabase-stack/files/init.sql'; fi`,
			);
			expect(cmd).toContain(
				`if [ -d '/etc/dokploy/compose/supabase-stack/files/config/app.conf' ]; then rm -rf '/etc/dokploy/compose/supabase-stack/files/config/app.conf'; fi`,
			);
			expect(cmd).toContain(
				encodeBase64("CREATE TABLE users (id SERIAL PRIMARY KEY);"),
			);
			expect(cmd).toContain(encodeBase64("listen = 8080"));
		});

		it("cleans leading slashes to prevent overwriting base files directory", () => {
			const mounts: Mount[] = [
				{
					type: "file",
					filePath: "/nested/entrypoint.sh",
					content: "#!/bin/sh\necho hi",
				},
			];

			const cmd = generateCreateMountsCommand(appName, baseFilesPath, mounts);
			expect(cmd).toContain(
				"/etc/dokploy/compose/supabase-stack/files/nested/entrypoint.sh",
			);
			expect(cmd).not.toContain("files//nested");
		});

		it("skips mounts with empty or whitespace-only paths", () => {
			const mounts: Mount[] = [
				{ type: "file", filePath: "   ", content: "bad" },
				{ type: "file", filePath: "/", content: "also bad" },
			];

			const cmd = generateCreateMountsCommand(appName, baseFilesPath, mounts);
			// Does not attempt to write directly to baseFilesPath
			expect(cmd).not.toContain(`rm -rf '${baseFilesPath}'`);
		});
	});

	describe("sanitizeFilePath", () => {
		it("strips single or multiple leading slashes and backslashes", () => {
			expect(sanitizeFilePath("/config.yaml")).toBe("config.yaml");
			expect(sanitizeFilePath("///nested/path.json")).toBe("nested/path.json");
			expect(sanitizeFilePath("\\windows\\style.txt")).toBe(
				"windows\\style.txt",
			);
			expect(sanitizeFilePath("  /trimmed/file.sql  ")).toBe(
				"trimmed/file.sql",
			);
		});

		it("handles empty or root-only strings", () => {
			expect(sanitizeFilePath("")).toBe("");
			expect(sanitizeFilePath("/")).toBe("");
			expect(sanitizeFilePath("   ")).toBe("");
		});
	});
});
