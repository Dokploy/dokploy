import { purgeAcmeCertificates } from "@dokploy/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execAsyncRemoteMock = vi.fn();
vi.mock("@dokploy/server/utils/process/execAsync", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/process/execAsync")
	>("@dokploy/server/utils/process/execAsync");
	return {
		...actual,
		execAsyncRemote: (serverId: string, command: string) =>
			execAsyncRemoteMock(serverId, command),
	};
});

const certificatesFor = (mains: string[]) =>
	JSON.stringify({
		letsencrypt: {
			Account: { Email: "test@localhost.com" },
			Certificates: mains.map((main) => ({
				domain: { main },
				certificate: "cert",
				key: "key",
			})),
		},
	});

const mainsIn = (raw: string): string[] =>
	(JSON.parse(raw).letsencrypt.Certificates ?? []).map(
		(certificate: { domain: { main: string } }) => certificate.domain.main,
	);

describe("purgeAcmeCertificates on a remote server", () => {
	/** One acme.json per remote host, as on a real fleet. */
	let remoteStores: Map<string, string>;
	/** Delay applied to the read, to give a concurrent purge room to interleave. */
	let readDelayMs: number;

	const storeOf = (serverId: string) => remoteStores.get(serverId) ?? "";

	beforeEach(() => {
		vi.clearAllMocks();
		remoteStores = new Map([
			["server-one", certificatesFor(["a.example.com", "b.example.com"])],
			["server-two", certificatesFor(["a.example.com", "b.example.com"])],
		]);
		readDelayMs = 0;

		execAsyncRemoteMock.mockImplementation(
			async (serverId: string, command: string) => {
				if (command.startsWith("cat ")) {
					// The remote reads the file when the command runs; the contents
					// only reach us after the round trip. Snapshotting before the
					// delay is what makes a concurrent purge observable.
					const snapshot = storeOf(serverId);
					await new Promise((resolve) => setTimeout(resolve, readDelayMs));
					return { stdout: snapshot, stderr: "" };
				}

				const payload = command.match(/printf '%s' "([^"]+)"/)?.[1];
				if (!payload) throw new Error(`unrecognised command: ${command}`);
				remoteStores.set(
					serverId,
					Buffer.from(payload, "base64").toString("utf8"),
				);
				return { stdout: "", stderr: "" };
			},
		);
	});

	it("removes the requested host and leaves the others", async () => {
		const removed = await purgeAcmeCertificates(
			["a.example.com"],
			"server-one",
		);

		expect(removed).toEqual(["a.example.com"]);
		expect(mainsIn(storeOf("server-one"))).toEqual(["b.example.com"]);
	});

	// Without serialisation both purges read the original store and the later
	// write puts back whatever the earlier one removed.
	it("does not lose a removal when two purges run concurrently", async () => {
		readDelayMs = 10;

		const [firstRemoved, secondRemoved] = await Promise.all([
			purgeAcmeCertificates(["a.example.com"], "server-one"),
			purgeAcmeCertificates(["b.example.com"], "server-one"),
		]);

		expect(firstRemoved).toEqual(["a.example.com"]);
		expect(secondRemoved).toEqual(["b.example.com"]);
		expect(mainsIn(storeOf("server-one"))).toEqual([]);
	});

	it("keeps serialising after a failed purge", async () => {
		readDelayMs = 5;
		const failing = execAsyncRemoteMock.getMockImplementation();
		execAsyncRemoteMock.mockImplementationOnce(async () => {
			throw new Error("ssh dropped");
		});

		const results = await Promise.allSettled([
			purgeAcmeCertificates(["a.example.com"], "server-one"),
			purgeAcmeCertificates(["b.example.com"], "server-one"),
		]);

		expect(failing).toBeDefined();
		expect(results[0]?.status).toBe("rejected");
		expect(results[1]).toEqual({
			status: "fulfilled",
			value: ["b.example.com"],
		});
		expect(mainsIn(storeOf("server-one"))).toEqual(["a.example.com"]);
	});

	// Traefik owns acme.json and rewrites it in full when it issues or renews a
	// certificate. Swapping in a snapshot taken before that write would drop the
	// new certificate from disk.
	it("does not drop a certificate Traefik writes while the purge is in flight", async () => {
		const passthrough = execAsyncRemoteMock.getMockImplementation();
		let reads = 0;

		execAsyncRemoteMock.mockImplementation(
			async (serverId: string, command: string) => {
				const result = await passthrough?.(serverId, command);
				if (command.startsWith("cat ")) {
					reads += 1;
					if (reads === 1) {
						// Traefik issues a certificate right after our first read.
						const store = JSON.parse(storeOf(serverId));
						store.letsencrypt.Certificates.push({
							domain: { main: "fresh.example.com" },
							certificate: "cert",
							key: "key",
						});
						remoteStores.set(serverId, JSON.stringify(store));
					}
				}
				return result;
			},
		);

		const removed = await purgeAcmeCertificates(
			["a.example.com"],
			"server-one",
		);

		expect(removed).toEqual(["a.example.com"]);
		expect(mainsIn(storeOf("server-one"))).toEqual([
			"b.example.com",
			"fresh.example.com",
		]);
	});

	it("runs purges for different servers independently", async () => {
		const removed = await Promise.all([
			purgeAcmeCertificates(["a.example.com"], "server-one"),
			purgeAcmeCertificates(["a.example.com"], "server-two"),
		]);

		expect(removed).toEqual([["a.example.com"], ["a.example.com"]]);
	});
});
