import { describe, expect, it } from "vitest";
import {
	classifyRemoteUnreachable,
	findTcpConnectFailure,
} from "@/server/api/remote-unreachable";

/** A Node socket error shaped like the ones libuv produces. */
const socketError = (
	code: string,
	extra: { address?: string; port?: number; syscall?: string } = {},
) => {
	const { address, port, syscall = "connect" } = extra;
	const target = address ? ` ${address}${port ? `:${port}` : ""}` : "";
	return Object.assign(new Error(`${syscall} ${code}${target}`), {
		errno: -113,
		code,
		syscall,
		address,
		port,
	});
};

describe("classifyRemoteUnreachable", () => {
	it("maps an EHOSTUNREACH TCP connect error and names the host", () => {
		const result = classifyRemoteUnreachable(
			socketError("EHOSTUNREACH", { address: "31.57.34.138", port: 22 }),
		);
		expect(result).toMatchObject({
			host: "31.57.34.138",
			port: 22,
			code: "EHOSTUNREACH",
		});
		expect(result?.message).toContain("31.57.34.138:22");
		expect(result?.message).toContain("EHOSTUNREACH");
		expect(result?.message).toContain("online and reachable over SSH");
	});

	it.each([
		"EHOSTUNREACH",
		"ENETUNREACH",
		"EHOSTDOWN",
		"ECONNREFUSED",
		"ETIMEDOUT",
		"ECONNRESET",
	])("maps %s on the SSH port", (code) => {
		const result = classifyRemoteUnreachable(
			socketError(code, { address: "10.0.0.5", port: 22 }),
		);
		expect(result?.code).toBe(code);
	});

	it("maps a nested cause", () => {
		const inner = socketError("ETIMEDOUT", {
			address: "203.0.113.9",
			port: 22,
		});
		const wrapped = new Error("docker failed", {
			cause: new Error("ssh failed", { cause: inner }),
		});
		expect(classifyRemoteUnreachable(wrapped)).toMatchObject({
			host: "203.0.113.9",
			code: "ETIMEDOUT",
		});
	});

	it("maps an ssh2 handshake timeout", () => {
		const err = Object.assign(
			new Error("Timed out while waiting for handshake"),
			{
				level: "client-timeout",
			},
		);
		const result = classifyRemoteUnreachable(err);
		expect(result?.code).toBe("ETIMEDOUT");
		expect(result?.message).toContain("Check that it is online");
	});

	it("maps an ExecError-style 'SSH connection error:' message and extracts the target", () => {
		const err = Object.assign(
			new Error("SSH connection error: connect EHOSTUNREACH 31.57.34.138:22"),
			{ name: "ExecError", serverId: "srv-1" },
		);
		expect(classifyRemoteUnreachable(err)).toMatchObject({
			host: "31.57.34.138",
			port: 22,
			code: "EHOSTUNREACH",
		});
	});

	it("maps a wrapped SSH timeout reached through originalError", () => {
		const err = Object.assign(new Error("Remote command failed"), {
			originalError: Object.assign(
				new Error("Timed out while waiting for handshake"),
				{
					level: "client-timeout",
				},
			),
		});
		expect(classifyRemoteUnreachable(err)?.code).toBe("ETIMEDOUT");
	});

	it("does not map a non-SSH port that is not a known server", () => {
		const err = socketError("ECONNREFUSED", {
			address: "93.184.216.34",
			port: 443,
		});
		expect(classifyRemoteUnreachable(err)).toBeNull();
	});

	it("maps a configured non-default SSH port", () => {
		const err = socketError("ECONNREFUSED", {
			address: "10.0.0.5",
			port: 2222,
		});
		expect(
			classifyRemoteUnreachable(err, {
				sshEndpoints: [{ host: "10.0.0.5", port: 2222 }],
			}),
		).toMatchObject({ host: "10.0.0.5", port: 2222, code: "ECONNREFUSED" });
		expect(findTcpConnectFailure(err)).toEqual({
			code: "ECONNREFUSED",
			host: "10.0.0.5",
			port: 2222,
		});
	});

	it("does NOT map ECONNREFUSED on the local docker socket", () => {
		const err = Object.assign(
			new Error("connect ECONNREFUSED /var/run/docker.sock"),
			{
				code: "ECONNREFUSED",
				syscall: "connect",
				address: "/var/run/docker.sock",
			},
		);
		expect(classifyRemoteUnreachable(err)).toBeNull();
		expect(findTcpConnectFailure(err)).toBeNull();
	});

	it("does NOT map ECONNRESET without a remote address", () => {
		expect(
			classifyRemoteUnreachable(socketError("ECONNRESET", { syscall: "read" })),
		).toBeNull();
	});

	it("does NOT map an SSH authentication failure", () => {
		const err = new Error(
			"SSH connection error: All configured authentication methods failed",
		);
		expect(classifyRemoteUnreachable(err)).toBeNull();
	});

	it("does NOT map an ordinary Error", () => {
		expect(classifyRemoteUnreachable(new Error("boom"))).toBeNull();
		expect(classifyRemoteUnreachable("string")).toBeNull();
		expect(classifyRemoteUnreachable(undefined)).toBeNull();
	});

	it("maps an AggregateError (autoSelectFamily) wrapping a remote connect failure", () => {
		const err = Object.assign(
			new AggregateError([
				socketError("EHOSTUNREACH", { address: "2001:db8::1", port: 22 }),
				socketError("EHOSTUNREACH", { address: "203.0.113.9", port: 22 }),
			]),
			{ code: "ECONNREFUSED" },
		);
		expect(err.message).toBe("");
		const result = classifyRemoteUnreachable(err);
		expect(result).toMatchObject({
			host: "2001:db8::1",
			port: 22,
			code: "EHOSTUNREACH",
		});
		expect(result?.message).toContain("[2001:db8::1]:22");
	});

	it("does NOT map an AggregateError that only wraps local-socket errors", () => {
		const local = Object.assign(
			new Error("connect ECONNREFUSED /var/run/docker.sock"),
			{
				code: "ECONNREFUSED",
				address: "/var/run/docker.sock",
			},
		);
		const err = Object.assign(new AggregateError([local, local]), {
			code: "ECONNREFUSED",
		});
		expect(classifyRemoteUnreachable(err)).toBeNull();
	});

	it("survives a cyclic cause chain", () => {
		const a: Error & { cause?: unknown } = new Error("a");
		const b: Error & { cause?: unknown } = new Error("b");
		a.cause = b;
		b.cause = a;
		expect(classifyRemoteUnreachable(a)).toBeNull();
	});
});
