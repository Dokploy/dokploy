import { parseRawConfig, processLogs } from "@dokploy/server";
import { describe, expect, it } from "vitest";

const sampleLogEntry = `{"ClientAddr":"172.19.0.1:56732","ClientHost":"172.19.0.1","ClientPort":"56732","ClientUsername":"-","DownstreamContentSize":0,"DownstreamStatus":304,"Duration":14729375,"OriginContentSize":0,"OriginDuration":14051833,"OriginStatus":304,"Overhead":677542,"RequestAddr":"s222-umami-c381af.traefik.me","RequestContentSize":0,"RequestCount":122,"RequestHost":"s222-umami-c381af.traefik.me","RequestMethod":"GET","RequestPath":"/dashboard?_rsc=1rugv","RequestPort":"-","RequestProtocol":"HTTP/1.1","RequestScheme":"http","RetryAttempts":0,"RouterName":"s222-umami-60e104-47-web@docker","ServiceAddr":"10.0.1.15:3000","ServiceName":"s222-umami-60e104-47-web@docker","ServiceURL":{"Scheme":"http","Opaque":"","User":null,"Host":"10.0.1.15:3000","Path":"","RawPath":"","ForceQuery":false,"RawQuery":"","Fragment":"","RawFragment":""},"StartLocal":"2024-08-25T04:34:37.306691884Z","StartUTC":"2024-08-25T04:34:37.306691884Z","entryPointName":"web","level":"info","msg":"","time":"2024-08-25T04:34:37Z"}`;

describe("processLogs", () => {
	it("should process a single log entry correctly", () => {
		const result = processLogs(sampleLogEntry);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			hour: "2024-08-25T04:00:00Z",
			count: 1,
		});
	});

	it("should process multiple log entries and group by hour", () => {
		const sampleLogEntry = `{"ClientAddr":"172.19.0.1:58094","ClientHost":"172.19.0.1","ClientPort":"58094","ClientUsername":"-","DownstreamContentSize":50,"DownstreamStatus":200,"Duration":35914250,"OriginContentSize":50,"OriginDuration":35817959,"OriginStatus":200,"Overhead":96291,"RequestAddr":"s222-pocketbase-f4a6e5.traefik.me","RequestContentSize":0,"RequestCount":991,"RequestHost":"s222-pocketbase-f4a6e5.traefik.me","RequestMethod":"GET","RequestPath":"/api/logs/stats?filter=","RequestPort":"-","RequestProtocol":"HTTP/1.1","RequestScheme":"http","RetryAttempts":0,"RouterName":"s222-pocketbase-e94e25-44-web@docker","ServiceAddr":"10.0.1.12:80","ServiceName":"s222-pocketbase-e94e25-44-web@docker","ServiceURL":{"Scheme":"http","Opaque":"","User":null,"Host":"10.0.1.12:80","Path":"","RawPath":"","ForceQuery":false,"RawQuery":"","Fragment":"","RawFragment":""},"StartLocal":"2024-08-25T17:44:29.274072471Z","StartUTC":"2024-08-25T17:44:29.274072471Z","entryPointName":"web","level":"info","msg":"","time":"2024-08-25T17:44:29Z"}
{"ClientAddr":"172.19.0.1:58108","ClientHost":"172.19.0.1","ClientPort":"58108","ClientUsername":"-","DownstreamContentSize":30975,"DownstreamStatus":200,"Duration":31406458,"OriginContentSize":30975,"OriginDuration":31046791,"OriginStatus":200,"Overhead":359667,"RequestAddr":"s222-pocketbase-f4a6e5.traefik.me","RequestContentSize":0,"RequestCount":992,"RequestHost":"s222-pocketbase-f4a6e5.traefik.me","RequestMethod":"GET","RequestPath":"/api/logs?page=1\u0026perPage=50\u0026sort=-rowid\u0026skipTotal=1\u0026filter=","RequestPort":"-","RequestProtocol":"HTTP/1.1","RequestScheme":"http","RetryAttempts":0,"RouterName":"s222-pocketbase-e94e25-44-web@docker","ServiceAddr":"10.0.1.12:80","ServiceName":"s222-pocketbase-e94e25-44-web@docker","ServiceURL":{"Scheme":"http","Opaque":"","User":null,"Host":"10.0.1.12:80","Path":"","RawPath":"","ForceQuery":false,"RawQuery":"","Fragment":"","RawFragment":""},"StartLocal":"2024-08-25T17:44:29.278990221Z","StartUTC":"2024-08-25T17:44:29.278990221Z","entryPointName":"web","level":"info","msg":"","time":"2024-08-25T17:44:29Z"}
`;

		const result = processLogs(sampleLogEntry);
		expect(result).toHaveLength(1);
		expect(result).toEqual([{ hour: "2024-08-25T17:00:00Z", count: 2 }]);
	});

	it("should return an empty array for empty input", () => {
		expect(processLogs("")).toEqual([]);
		expect(processLogs(null as any)).toEqual([]);
		expect(processLogs(undefined as any)).toEqual([]);
	});

	// it("should parse a single log entry correctly", () => {
	// 	const result = parseRawConfig(sampleLogEntry);
	// 	expect(result).toHaveLength(1);
	// 	expect(result.data[0]).toHaveProperty("ClientAddr", "172.19.0.1:56732");
	// 	expect(result.data[0]).toHaveProperty(
	// 		"StartUTC",
	// 		"2024-08-25T04:34:37.306691884Z",
	// 	);
	// });

	it("should parse multiple log entries", () => {
		const multipleEntries = `${sampleLogEntry}\n${sampleLogEntry}`;
		const result = parseRawConfig(multipleEntries);
		expect(result.data).toHaveLength(2);

		for (const entry of result.data) {
			expect(entry).toHaveProperty("ClientAddr", "172.19.0.1:56732");
		}
	});

	it("should handle whitespace and empty lines", () => {
		const entryWithWhitespace = `\n${sampleLogEntry}\n\n${sampleLogEntry}\n`;
		const result = parseRawConfig(entryWithWhitespace);
		expect(result.data).toHaveLength(2);
	});
});
