import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unzipDrop } from "@dokploy/server";
import AdmZip from "adm-zip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Production layout: BASE_PATH is the PARENT of APPLICATIONS_PATH
// (/etc/dokploy vs /etc/dokploy/applications). The existing GHSA-66v7 test
// collapses them to the same dir, so it only catches escapes that leave
// BASE_PATH entirely. This reproduces the in-BASE_PATH escape instead.
const TMP = path.join(os.tmpdir(), `dokploy-zipslip-${process.pid}`);
const BASE_PATH = path.join(TMP, "base");
const APPLICATIONS_PATH = path.join(BASE_PATH, "applications");

vi.mock("@dokploy/server/constants", async (importOriginal) => {
	const actual = (await importOriginal()) as any;
	return {
		...actual,
		paths: () => ({ ...actual.paths(), BASE_PATH, APPLICATIONS_PATH }),
	};
});

if (typeof window === "undefined") {
	const undici = require("undici");
	globalThis.File = undici.File as any;
	globalThis.FileList = undici.FileList as any;
}

const app = { appName: "attacker", serverId: null, buildServerId: null } as any;

describe("zip-slip within BASE_PATH (cross-service write)", () => {
	beforeAll(async () => {
		await fs.rm(TMP, { recursive: true, force: true });
		await fs.mkdir(path.join(APPLICATIONS_PATH, "attacker", "code"), {
			recursive: true,
		});
	});
	afterAll(async () => {
		await fs.rm(TMP, { recursive: true, force: true });
	});

	it("rejects an entry that escapes the app dir but stays under BASE_PATH", async () => {
		const traversalEntry = "../../victim/code/pwned.txt";
		const placeholder = "x".repeat(traversalEntry.length);
		const zip = new AdmZip();
		zip.addFile("package.json", Buffer.from('{"name":"a","version":"1.0.0"}'));
		zip.addFile(placeholder, Buffer.from("PWNED"));
		let buf = Buffer.from(zip.toBuffer());
		buf = Buffer.from(
			buf.toString("binary").split(placeholder).join(traversalEntry),
			"binary",
		);
		const file = new File([buf as unknown as ArrayBuffer], "exploit.zip");

		await expect(unzipDrop(file, app)).rejects.toThrow(
			/resolved path escapes output directory/,
		);

		const victimFile = path.join(
			APPLICATIONS_PATH,
			"victim",
			"code",
			"pwned.txt",
		);
		const written = await fs
			.readFile(victimFile, "utf8")
			.then((c) => c)
			.catch(() => null);

		expect(written).toBeNull();
	});
});
