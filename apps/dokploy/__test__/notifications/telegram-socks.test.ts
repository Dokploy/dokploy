import { readFileSync } from "node:fs";
import type { Agent, IncomingMessage } from "node:http";
import {
	createServer,
	request as httpsRequest,
	type RequestOptions,
} from "node:https";
import type { Duplex } from "node:stream";
import { inspect } from "node:util";
import { sendTelegramNotification } from "@dokploy/server/utils/notifications/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSocksServer } from "./fixtures/socks-server";

vi.mock("node:https", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:https")>();
	return { ...actual, request: vi.fn(actual.request) };
});

const actualHttps =
	await vi.importActual<typeof import("node:https")>("node:https");
const certificate = readFileSync(
	new URL("./fixtures/telegram-cert.crt", import.meta.url),
);
const key = readFileSync(
	new URL("./fixtures/telegram-key.key", import.meta.url),
);
const connection = {
	botToken: "test-token",
	chatId: "-100123",
	messageThreadId: "42",
};
let trustCertificate = true;
let requestTimeout: number | undefined;
let handshakeTimeout: number | undefined;
const agents: Agent[] = [];
const cleanup: (() => Promise<void>)[] = [];

const startTelegramServer = async (
	options: { status?: number; body?: string; hangResponse?: boolean } = {},
) => {
	const requests: {
		path: string | undefined;
		headers: IncomingMessage["headers"];
		body: unknown;
	}[] = [];
	const sockets = new Set<Duplex>();
	const server = createServer(
		{ key, cert: certificate },
		(request, response) => {
			const chunks: Buffer[] = [];
			request.on("data", (chunk: Buffer) => chunks.push(chunk));
			request.on("end", () => {
				requests.push({
					path: request.url,
					headers: request.headers,
					body: JSON.parse(Buffer.concat(chunks).toString()),
				});
				if (options.hangResponse) return;
				response.writeHead(options.status ?? 200);
				response.end(options.body ?? '{"ok":true}');
			});
		},
	);
	server.on("connection", (socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	cleanup.push(async () => {
		for (const socket of sockets) socket.destroy();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Missing address");
	return { port: address.port, requests };
};

const startProxy = async (
	port: number,
	options?: Parameters<typeof startSocksServer>[1],
) => {
	const proxy = await startSocksServer(port, options);
	cleanup.push(proxy.close);
	return proxy;
};

beforeEach(() => {
	trustCertificate = true;
	requestTimeout = undefined;
	handshakeTimeout = undefined;
	vi.stubGlobal("fetch", vi.fn());
	vi.spyOn(console, "log").mockImplementation(() => {});
	agents.length = 0;
	vi.mocked(httpsRequest).mockImplementation(((
		url: string | URL,
		options: RequestOptions,
		callback: (response: IncomingMessage) => void,
	) => {
		const agent = options.agent as Agent & { timeout: number };
		expect(agent.timeout).toBe(30_000);
		if (handshakeTimeout !== undefined) agent.timeout = handshakeTimeout;
		vi.spyOn(agent, "destroy");
		agents.push(agent);
		// Trust only this fixture certificate; retain normal hostname/TLS checks.
		const request = actualHttps.request(
			url,
			{ ...options, ...(trustCertificate ? { ca: certificate } : {}) },
			callback,
		);
		const setTimeout = request.setTimeout.bind(request);
		vi.spyOn(request, "setTimeout").mockImplementation((timeout, callback) => {
			expect(timeout).toBe(30_000);
			return setTimeout(requestTimeout ?? timeout, callback);
		});
		return request;
	}) as typeof httpsRequest);
});

afterEach(async () => {
	for (const close of cleanup.reverse()) await close();
	cleanup.length = 0;
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("Telegram through a real SOCKS5 tunnel", () => {
	it.each(["socks5:", "socks5h:"])(
		"uses remote DNS and preserves Telegram payload with %s",
		async (protocol) => {
			const telegram = await startTelegramServer();
			const proxy = await startProxy(telegram.port);
			const proxyUrl = new URL(proxy.url);
			proxyUrl.protocol = protocol;
			const buttons = [[{ text: "Open", url: "https://dokploy.example.com" }]];
			await sendTelegramNotification(
				{ ...connection, proxyUrl: proxyUrl.href },
				"<b>Ready</b>",
				buttons,
			);
			expect(proxy.destinations).toEqual([
				{ host: "api.telegram.org", port: 443 },
			]);
			expect(telegram.requests).toEqual([
				{
					path: "/bottest-token/sendMessage",
					headers: expect.objectContaining({
						host: "api.telegram.org",
						"content-type": "application/json",
					}),
					body: {
						chat_id: "-100123",
						message_thread_id: "42",
						text: "<b>Ready</b>",
						parse_mode: "HTML",
						disable_web_page_preview: true,
						reply_markup: { inline_keyboard: buttons },
					},
				},
			]);
			expect(fetch).not.toHaveBeenCalled();
			expect(agents[0]?.destroy).toHaveBeenCalledTimes(1);
			await vi.waitFor(() => expect(proxy.sockets.size).toBe(0));
		},
	);

	it("authenticates with URL-encoded credentials without sending them to Telegram", async () => {
		const telegram = await startTelegramServer();
		const credentials = { username: "user@name", password: "p:ss/word%" };
		const proxy = await startProxy(telegram.port, { credentials });
		const proxyUrl = new URL(proxy.url);
		proxyUrl.username = encodeURIComponent(credentials.username);
		proxyUrl.password = encodeURIComponent(credentials.password);
		await sendTelegramNotification(
			{ ...connection, proxyUrl: proxyUrl.href },
			"hi",
		);
		expect(proxy.credentials).toEqual([credentials]);
		expect(telegram.requests[0]?.headers.authorization).toBeUndefined();
		expect(
			telegram.requests[0]?.headers["proxy-authorization"],
		).toBeUndefined();
		expect(JSON.stringify(telegram.requests)).not.toContain(
			credentials.password,
		);
		expect(agents[0]?.destroy).toHaveBeenCalledTimes(1);
	});

	it("connects to an IPv6 proxy using its unbracketed hostname", async () => {
		const telegram = await startTelegramServer();
		const proxy = await startProxy(telegram.port, { listenHost: "::1" });
		await sendTelegramNotification(
			{ ...connection, proxyUrl: proxy.url },
			"hi",
		);
		expect(proxy.destinations).toEqual([
			{ host: "api.telegram.org", port: 443 },
		]);
		expect(telegram.requests).toHaveLength(1);
		expect(agents[0]?.destroy).toHaveBeenCalledTimes(1);
	});

	it("preserves non-OK Telegram responses and closes the tunnel", async () => {
		const telegram = await startTelegramServer({
			status: 400,
			body: "bad chat",
		});
		const proxy = await startProxy(telegram.port);
		await expect(
			sendTelegramNotification({ ...connection, proxyUrl: proxy.url }, "hi"),
		).rejects.toThrow("Failed to send telegram notification: 400 bad chat");
		expect(agents[0]?.destroy).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(proxy.sockets.size).toBe(0));
	});

	it("does not bypass TLS certificate validation", async () => {
		trustCertificate = false;
		const telegram = await startTelegramServer();
		const proxy = await startProxy(telegram.port);
		await expect(
			sendTelegramNotification({ ...connection, proxyUrl: proxy.url }, "hi"),
		).rejects.toThrow(/self.signed certificate/i);
		expect(telegram.requests).toHaveLength(0);
		expect(fetch).not.toHaveBeenCalled();
		expect(agents[0]?.destroy).toHaveBeenCalledTimes(1);
	});

	it("does not retry directly when the proxy rejects CONNECT", async () => {
		const telegram = await startTelegramServer();
		const proxy = await startProxy(telegram.port, { rejectConnect: true });
		await expect(
			sendTelegramNotification({ ...connection, proxyUrl: proxy.url }, "hi"),
		).rejects.toThrow(/Socks5 proxy rejected connection/i);
		expect(proxy.connections).toBe(1);
		expect(telegram.requests).toHaveLength(0);
		expect(fetch).not.toHaveBeenCalled();
		expect(agents[0]?.destroy).toHaveBeenCalledTimes(1);
	});

	it("fails on rejected proxy authentication without leaking credentials", async () => {
		const telegram = await startTelegramServer();
		const proxy = await startProxy(telegram.port, {
			credentials: { username: "private-user", password: "correct" },
		});
		const proxyUrl = new URL(proxy.url);
		proxyUrl.username = "private-user";
		proxyUrl.password = "wrong-secret";
		let failure: unknown;
		try {
			await sendTelegramNotification(
				{ ...connection, proxyUrl: proxyUrl.href },
				"hi",
			);
		} catch (error) {
			failure = error;
		}
		expect(failure).toBeInstanceOf(Error);
		expect(String(failure)).toMatch(/authentication failed/i);
		expect(String(failure)).not.toContain("wrong-secret");
		expect(inspect(failure, { depth: 10 })).not.toContain("private-user");
		expect(
			inspect(vi.mocked(console.log).mock.calls, { depth: 10 }),
		).not.toContain("wrong-secret");
		expect(
			inspect(vi.mocked(console.log).mock.calls, { depth: 10 }),
		).not.toContain("private-user");
		expect(fetch).not.toHaveBeenCalled();
		expect(agents[0]?.destroy).toHaveBeenCalledTimes(1);
	});

	it("times out a stalled SOCKS handshake and releases its socket", async () => {
		handshakeTimeout = 40;
		const telegram = await startTelegramServer();
		const proxy = await startProxy(telegram.port, { hangHandshake: true });
		await expect(
			sendTelegramNotification({ ...connection, proxyUrl: proxy.url }, "hi"),
		).rejects.toThrow(/timed out/i);
		expect(fetch).not.toHaveBeenCalled();
		expect(agents[0]?.destroy).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(proxy.sockets.size).toBe(0));
	});

	it("times out a stalled HTTPS response and closes the tunnel", async () => {
		requestTimeout = 40;
		const telegram = await startTelegramServer({ hangResponse: true });
		const proxy = await startProxy(telegram.port);
		await expect(
			sendTelegramNotification({ ...connection, proxyUrl: proxy.url }, "hi"),
		).rejects.toThrow("Telegram notification request timed out");
		expect(fetch).not.toHaveBeenCalled();
		expect(agents[0]?.destroy).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(proxy.sockets.size).toBe(0));
	});
});
