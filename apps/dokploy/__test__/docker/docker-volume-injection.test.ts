import {
	deleteVolumeFile,
	listVolumeFiles,
	readVolumeFile,
	writeVolumeFile,
} from "@dokploy/server";
import { parse } from "shell-quote";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { volumeNameRegex } from "@/server/api/routers/docker-volume";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

// shell-quote's quote() backslash-escapes "=" and "," in the raw command
// string; parse() the command to assert the literal token docker receives.
const hasToken = (command: string, token: string) =>
	parse(command).some((t) => t === token);

describe("volumeNameRegex", () => {
	// Docker's CLI treats a `-v`/`--mount` source starting with "." or "-" as a
	// client-relative bind-mount path, not a named volume — the exact escape
	// this fix closes. These must not pass validation.
	const REJECTED = [
		".",
		"..",
		".foo",
		".ssh",
		"-foo",
		"-",
		"/",
		"foo/bar",
		"",
		" leading-space",
	];

	it.each(REJECTED)("rejects %p", (value) => {
		expect(volumeNameRegex.test(value)).toBe(false);
	});

	const ACCEPTED = [
		"a",
		"0",
		"myvol",
		"my-vol",
		"my_vol",
		"my.vol",
		"abc123",
		"Volume1.2-3_4",
		"dbdata",
	];

	it.each(ACCEPTED)("accepts %p", (value) => {
		expect(volumeNameRegex.test(value)).toBe(true);
	});
});

describe("docker-volume service commands", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
	});

	const READONLY = "type=volume,source=myvol,target=/__volume,readonly";
	const READWRITE = "type=volume,source=myvol,target=/__volume";

	it("listVolumeFiles mounts a read-only named volume, not a bind mount", async () => {
		await listVolumeFiles("myvol", "/dir");
		expect(mocks.execAsync).toHaveBeenCalledOnce();
		const command = mocks.execAsync.mock.calls[0]?.[0] as string;
		expect(hasToken(command, READONLY)).toBe(true);
		expect(command).not.toContain(" -v ");
		expect(command).toContain("busybox ls -1Ap");
	});

	it("readVolumeFile mounts the volume read-only", async () => {
		await readVolumeFile("myvol", "/file.txt");
		const command = mocks.execAsync.mock.calls[0]?.[0] as string;
		expect(hasToken(command, READONLY)).toBe(true);
		expect(command).not.toContain(" -v ");
		expect(command).toContain("busybox cat");
	});

	it("writeVolumeFile mounts the volume read-write", async () => {
		await writeVolumeFile("myvol", "/file.txt", "hello");
		const command = mocks.execAsync.mock.calls[0]?.[0] as string;
		expect(hasToken(command, READWRITE)).toBe(true);
		expect(hasToken(command, READONLY)).toBe(false);
		expect(command).not.toContain("readonly");
		expect(command).not.toContain(" -v ");
		expect(command).toContain("busybox sh -c");
	});

	it("deleteVolumeFile mounts the volume read-write", async () => {
		await deleteVolumeFile("myvol", "/dir");
		const command = mocks.execAsync.mock.calls[0]?.[0] as string;
		expect(hasToken(command, READWRITE)).toBe(true);
		expect(command).not.toContain(" -v ");
		expect(command).toContain("busybox rm -rf");
	});

	it("uses execAsyncRemote with the serverId on remote calls", async () => {
		await listVolumeFiles("myvol", "/dir", "srv-1");
		await deleteVolumeFile("myvol", "/dir", "srv-2");
		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).toHaveBeenCalledTimes(2);
		const [listServerId, listCommand] = mocks.execAsyncRemote.mock.calls[0] as [
			string,
			string,
		];
		const [delServerId, delCommand] = mocks.execAsyncRemote.mock.calls[1] as [
			string,
			string,
		];
		expect(listServerId).toBe("srv-1");
		expect(hasToken(listCommand, READONLY)).toBe(true);
		expect(listCommand).not.toContain(" -v ");
		expect(delServerId).toBe("srv-2");
		expect(hasToken(delCommand, READWRITE)).toBe(true);
		expect(delCommand).not.toContain(" -v ");
	});

	it("readVolumeFile uses execAsyncRemote and mounts read-only on remote calls", async () => {
		await readVolumeFile("myvol", "/file.txt", "srv-3");
		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).toHaveBeenCalledOnce();
		const [serverId, command] = mocks.execAsyncRemote.mock.calls[0] as [
			string,
			string,
		];
		expect(serverId).toBe("srv-3");
		expect(hasToken(command, READONLY)).toBe(true);
		expect(command).not.toContain(" -v ");
		expect(command).toContain("busybox cat");
	});

	it("writeVolumeFile uses execAsyncRemote and mounts read-write on remote calls", async () => {
		await writeVolumeFile("myvol", "/file.txt", "hello", "srv-4");
		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).toHaveBeenCalledOnce();
		const [serverId, command] = mocks.execAsyncRemote.mock.calls[0] as [
			string,
			string,
		];
		expect(serverId).toBe("srv-4");
		expect(hasToken(command, READWRITE)).toBe(true);
		expect(hasToken(command, READONLY)).toBe(false);
		expect(command).not.toContain("readonly");
		expect(command).not.toContain(" -v ");
		expect(command).toContain("busybox sh -c");
	});
});
