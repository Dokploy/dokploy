import { parseRawConfig, processLogs } from "@dokploy/server";
import { expect, test } from "vitest";

const caddyLogEntry = JSON.stringify({
	level: "info",
	ts: 1_724_603_677.306,
	logger: "http.log.access",
	msg: "handled request",
	server_name: "http",
	request: {
		remote_ip: "192.0.2.10",
		remote_port: "54321",
		client_ip: "198.51.100.20",
		proto: "HTTP/2.0",
		method: "GET",
		host: "app.example.com",
		uri: "/dashboard?_rsc=1",
		tls: {
			resumed: false,
		},
		headers: {
			"User-Agent": ["curl/8.0"],
		},
	},
	bytes_read: 7,
	duration: 0.014729375,
	size: 1234,
	status: 200,
});

const traefikLogEntry = `{"ClientAddr":"172.19.0.1:56732","ClientHost":"172.19.0.1","ClientPort":"56732","ClientUsername":"-","DownstreamContentSize":0,"DownstreamStatus":304,"Duration":14729375,"OriginContentSize":0,"OriginDuration":14051833,"OriginStatus":304,"Overhead":677542,"RequestAddr":"app.traefik.test","RequestContentSize":0,"RequestCount":122,"RequestHost":"app.traefik.test","RequestMethod":"GET","RequestPath":"/dashboard?_rsc=1rugv","RequestPort":"-","RequestProtocol":"HTTP/1.1","RequestScheme":"http","RetryAttempts":0,"RouterName":"app-router@docker","ServiceAddr":"10.0.1.15:3000","ServiceName":"app-service@docker","ServiceURL":{"Scheme":"http","Opaque":"","User":null,"Host":"10.0.1.15:3000","Path":"","RawPath":"","ForceQuery":false,"RawQuery":"","Fragment":"","RawFragment":""},"StartLocal":"2024-08-25T04:34:37.306691884Z","StartUTC":"2024-08-25T04:34:37.306691884Z","entryPointName":"web","level":"info","msg":"","time":"2024-08-25T04:34:37Z"}`;

test("normalizes Caddy JSON access logs into the Requests table shape", () => {
	const result = parseRawConfig(caddyLogEntry);

	expect(result.totalCount).toBe(1);
	expect(result.data[0]).toMatchObject({
		Provider: "caddy",
		ClientAddr: "192.0.2.10:54321",
		ClientHost: "198.51.100.20",
		ClientPort: "54321",
		DownstreamStatus: 200,
		Duration: 14_729_375,
		RequestHost: "app.example.com",
		RequestMethod: "GET",
		RequestPath: "/dashboard?_rsc=1",
		RequestPort: "443",
		RequestProtocol: "HTTP/2.0",
		RequestScheme: "https",
		ServiceName: "http",
		request_User_Agent: "curl/8.0",
	});
});

test("normalizes Caddy user-agent headers case-insensitively", () => {
	const result = parseRawConfig(
		JSON.stringify({
			...JSON.parse(caddyLogEntry),
			request: {
				...JSON.parse(caddyLogEntry).request,
				headers: {
					"user-agent": ["lowercase-agent"],
				},
			},
		}),
	);

	expect(result.data[0]?.request_User_Agent).toBe("lowercase-agent");
});

test("filters and groups normalized Caddy request logs", () => {
	const rawConfig = `${caddyLogEntry}\n${JSON.stringify({
		...JSON.parse(caddyLogEntry),
		ts: 1_724_607_277.306,
		status: 404,
		request: {
			...JSON.parse(caddyLogEntry).request,
			host: "api.example.com",
			uri: "/missing",
			tls: undefined,
		},
	})}`;

	expect(
		parseRawConfig(rawConfig, undefined, undefined, "app.example", ["success"])
			.totalCount,
	).toBe(1);
	expect(
		parseRawConfig(rawConfig, undefined, undefined, "api.example", ["client"])
			.totalCount,
	).toBe(1);
	expect(
		processLogs(rawConfig, {
			start: "2024-08-25T16:00:00.000Z",
			end: "2024-08-25T17:00:00.000Z",
		}),
	).toEqual([{ hour: "2024-08-25T16:00:00Z", count: 1 }]);
});

test("preserves existing Traefik request log parsing", () => {
	const result = parseRawConfig(traefikLogEntry);

	expect(result.totalCount).toBe(1);
	expect(result.data[0]).toMatchObject({
		Provider: "traefik",
		RequestHost: "app.traefik.test",
		DownstreamStatus: 304,
		Duration: 14_729_375,
	});
});
