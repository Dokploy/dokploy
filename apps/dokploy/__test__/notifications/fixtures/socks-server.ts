import { createConnection, createServer, type Socket } from "node:net";

export const startSocksServer = async (
	targetPort: number,
	options: {
		credentials?: { username: string; password: string };
		rejectConnect?: boolean;
		hangHandshake?: boolean;
		listenHost?: string;
	} = {},
) => {
	const sockets = new Set<Socket>();
	const destinations: { host: string; port: number }[] = [];
	const credentials: { username: string; password: string }[] = [];
	let connections = 0;
	const track = (socket: Socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
		socket.on("error", () => socket.destroy());
	};
	const server = createServer((socket) => {
		connections++;
		track(socket);
		if (options.hangHandshake) {
			socket.resume();
			return;
		}
		let buffer = Buffer.alloc(0);
		let phase: "greeting" | "auth" | "connect" | "tunnel" = "greeting";
		socket.on("data", function receive(chunk: Buffer) {
			buffer = Buffer.concat([buffer, chunk]);
			if (phase === "greeting") {
				if (buffer.length < 2 || buffer.length < 2 + buffer[1]!) return;
				const methods = buffer.subarray(2, 2 + buffer[1]!);
				const method = options.credentials ? 2 : 0;
				if (buffer[0] !== 5 || !methods.includes(method)) {
					socket.end(Buffer.from([5, 255]));
					return;
				}
				buffer = buffer.subarray(2 + buffer[1]!);
				phase = options.credentials ? "auth" : "connect";
				socket.write(Buffer.from([5, method]));
			}
			if (phase === "auth") {
				if (buffer.length < 2) return;
				const usernameLength = buffer[1]!;
				if (buffer.length < 3 + usernameLength) return;
				const passwordLength = buffer[2 + usernameLength]!;
				if (buffer.length < 3 + usernameLength + passwordLength) return;
				const received = {
					username: buffer.subarray(2, 2 + usernameLength).toString(),
					password: buffer
						.subarray(3 + usernameLength, 3 + usernameLength + passwordLength)
						.toString(),
				};
				credentials.push(received);
				if (
					received.username !== options.credentials?.username ||
					received.password !== options.credentials?.password
				) {
					socket.end(Buffer.from([1, 1]));
					return;
				}
				buffer = buffer.subarray(3 + usernameLength + passwordLength);
				phase = "connect";
				socket.write(Buffer.from([1, 0]));
			}
			if (phase !== "connect" || buffer.length < 5) return;
			// Accept only domain-name destinations, so tests also assert remote DNS.
			if (buffer[0] !== 5 || buffer[1] !== 1 || buffer[3] !== 3) {
				socket.end(Buffer.from([5, 8, 0, 1, 0, 0, 0, 0, 0, 0]));
				return;
			}
			const hostLength = buffer[4]!;
			if (buffer.length < 7 + hostLength) return;
			destinations.push({
				host: buffer.subarray(5, 5 + hostLength).toString(),
				port: buffer.readUInt16BE(5 + hostLength),
			});
			if (options.rejectConnect) {
				socket.end(Buffer.from([5, 5, 0, 1, 0, 0, 0, 0, 0, 0]));
				return;
			}
			phase = "tunnel";
			socket.removeListener("data", receive);
			const remaining = buffer.subarray(7 + hostLength);
			const upstream = createConnection(targetPort, "127.0.0.1", () => {
				socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
				if (remaining.length) upstream.write(remaining);
				socket.pipe(upstream);
				upstream.pipe(socket);
			});
			track(upstream);
			socket.once("close", () => upstream.destroy());
			upstream.once("close", () => socket.destroy());
		});
	});
	const listenHost = options.listenHost ?? "127.0.0.1";
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, listenHost, resolve);
	});
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Missing address");
	return {
		url: `socks5://${listenHost.includes(":") ? `[${listenHost}]` : listenHost}:${address.port}`,
		destinations,
		credentials,
		sockets,
		get connections() {
			return connections;
		},
		close: async () => {
			for (const socket of sockets) socket.destroy();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		},
	};
};
