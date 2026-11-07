import { quote } from "shell-quote";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

const { removeImage } = await import("@dokploy/server/services/docker-image");

const ID = "a704ba7c71ab";
const DIGEST =
	"sha256:a704ba7c71abacd1d6f849f48bb2f1a004f7591bee3b54e0fd4dd5efa01bc7de";

const fakeDocker = (repoTags: string[]) => async (command: string) => {
	if (command.startsWith("docker image inspect")) {
		return {
			stdout: JSON.stringify([{ Id: DIGEST, RepoTags: repoTags }]),
			stderr: "",
		};
	}
	return { stdout: "", stderr: "" };
};

const rmiCommands = (calls: unknown[][]) =>
	calls
		.map((args) => args[args.length - 1] as string)
		.filter((command) => command.startsWith("docker rmi"));

beforeEach(() => {
	mocks.execAsync.mockReset();
	mocks.execAsyncRemote.mockReset();
});

describe("removeImage", () => {
	it("removes a Swarm-pulled image by the digest-pinned name it is stored under", async () => {
		const stored = `gentslava/dokploy:v0.30.10@${DIGEST}`;
		mocks.execAsync.mockImplementation(fakeDocker([stored]));

		await removeImage({
			repository: "gentslava/dokploy",
			tag: "v0.30.10",
			id: ID,
		});

		expect(rmiCommands(mocks.execAsync.mock.calls)).toEqual([
			`docker rmi ${quote([stored])}`,
		]);
	});

	it("does not pick a longer tag that starts with the selected one", async () => {
		mocks.execAsync.mockImplementation(
			fakeDocker([`app:v1.0@${DIGEST}`, `app:v1@${DIGEST}`]),
		);

		await removeImage({ repository: "app", tag: "v1", id: ID });

		expect(rmiCommands(mocks.execAsync.mock.calls)).toEqual([
			`docker rmi ${quote([`app:v1@${DIGEST}`])}`,
		]);
	});

	it("untags only the selected tag when the image has several", async () => {
		mocks.execAsync.mockImplementation(
			fakeDocker(["dr/lk:prod", "dr/lk:1e7a"]),
		);

		await removeImage({ repository: "dr/lk", tag: "prod", id: ID });

		expect(rmiCommands(mocks.execAsync.mock.calls)).toEqual([
			`docker rmi ${quote(["dr/lk:prod"])}`,
		]);
	});

	it("removes an untagged image by ID", async () => {
		mocks.execAsync.mockImplementation(fakeDocker([]));

		await removeImage({ repository: "<none>", tag: "<none>", id: ID });

		expect(rmiCommands(mocks.execAsync.mock.calls)).toEqual([
			`docker rmi ${ID}`,
		]);
	});

	it("resolves and removes the image on the remote server", async () => {
		const stored = `gentslava/dokploy:v0.30.10@${DIGEST}`;
		mocks.execAsyncRemote.mockImplementation(
			(_serverId: string, command: string) => fakeDocker([stored])(command),
		);

		await removeImage(
			{ repository: "gentslava/dokploy", tag: "v0.30.10", id: ID, force: true },
			"server-1",
		);

		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"server-1",
			`docker rmi -f ${quote([stored])}`,
		);
	});
});
