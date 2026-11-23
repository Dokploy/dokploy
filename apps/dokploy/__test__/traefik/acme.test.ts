import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	dynamicDir: "",
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/constants", () => ({
	paths: (isServer: boolean) => ({
		DYNAMIC_TRAEFIK_PATH: isServer
			? "/etc/dokploy/traefik/dynamic"
			: state.dynamicDir,
	}),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsyncRemote: state.execAsyncRemote,
}));

const {
	acmeFilePath,
	getLetsEncryptHosts,
	readAcmeFile,
	withoutLetsEncryptHosts,
	writeAcmeFile,
} = await import("@dokploy/server/utils/traefik/acme");

const cert = (main: string) => ({
	domain: { main },
	certificate: `cert-${main}`,
	key: `key-${main}`,
	Store: "default",
});

const store = () => ({
	letsencrypt: {
		Account: { Email: "test@localhost.com" },
		Certificates: [cert("app.example.com"), cert("Other.Example.com")],
	},
	myresolver: {
		Account: { Email: "test@localhost.com" },
		Certificates: [cert("app.example.com")],
	},
});

beforeEach(() => {
	state.dynamicDir = fs.mkdtempSync(path.join(os.tmpdir(), "acme-"));
	state.execAsyncRemote.mockReset();
});

afterEach(() => {
	fs.rmSync(state.dynamicDir, { recursive: true, force: true });
});

describe("getLetsEncryptHosts", () => {
	it("lists the letsencrypt store's hosts in lowercase", () => {
		expect(getLetsEncryptHosts(JSON.stringify(store()))).toEqual([
			"app.example.com",
			"other.example.com",
		]);
	});

	it("returns nothing for an empty or malformed file", () => {
		expect(getLetsEncryptHosts("")).toEqual([]);
		expect(getLetsEncryptHosts("{not json")).toEqual([]);
		expect(
			getLetsEncryptHosts(
				JSON.stringify({ letsencrypt: { Certificates: null } }),
			),
		).toEqual([]);
	});
});

describe("withoutLetsEncryptHosts", () => {
	it("removes only the hosts from the letsencrypt store", () => {
		const result = withoutLetsEncryptHosts(JSON.stringify(store()), [
			"app.example.com",
		]);

		const expected = store();
		expected.letsencrypt.Certificates = [cert("Other.Example.com")];
		expect(JSON.parse(result!)).toEqual(expected);
	});

	it("matches hosts case-insensitively", () => {
		const result = withoutLetsEncryptHosts(JSON.stringify(store()), [
			"other.example.com",
		]);

		expect(JSON.parse(result!).letsencrypt.Certificates).toEqual([
			cert("app.example.com"),
		]);
	});

	it("returns null when nothing would change", () => {
		const raw = JSON.stringify(store());
		expect(withoutLetsEncryptHosts(raw, ["missing.example.com"])).toBeNull();
		expect(withoutLetsEncryptHosts(raw, [])).toBeNull();
		expect(withoutLetsEncryptHosts("", ["app.example.com"])).toBeNull();
		expect(
			withoutLetsEncryptHosts("{not json", ["app.example.com"]),
		).toBeNull();
	});
});

describe("readAcmeFile / writeAcmeFile", () => {
	it("writes atomically with 0600 and reads it back", async () => {
		const file = acmeFilePath(null);
		fs.writeFileSync(file, "old", { mode: 0o644 });

		await writeAcmeFile("new", null);

		expect(await readAcmeFile(null)).toBe("new");
		expect(fs.statSync(file).mode & 0o777).toBe(0o600);
		expect(fs.existsSync(`${file}.tmp`)).toBe(false);
	});

	it("reads a missing file as empty", async () => {
		expect(await readAcmeFile(null)).toBe("");
	});

	it("writes a remote file through stdin, quoted", async () => {
		state.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });

		await writeAcmeFile("content", "server-1");

		const [serverId, command, , input] = state.execAsyncRemote.mock.calls[0]!;
		expect(serverId).toBe("server-1");
		expect(command).toBe(
			"cat > /etc/dokploy/traefik/dynamic/acme.json.tmp && chmod 600 /etc/dokploy/traefik/dynamic/acme.json.tmp && mv /etc/dokploy/traefik/dynamic/acme.json.tmp /etc/dokploy/traefik/dynamic/acme.json",
		);
		expect(input).toBe("content");
	});
});
