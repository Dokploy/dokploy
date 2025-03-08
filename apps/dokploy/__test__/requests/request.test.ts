import { calculateRequestsStatistics, parseLogs } from "@dokploy/server";
import { temporaryFile } from "tempy";
import { describe, expect, it } from "vitest";

import fs from "node:fs";

const sampleLogEntry = `{"ClientAddr":"172.19.0.1:56732","ClientHost":"172.19.0.1","ClientPort":"56732","ClientUsername":"-","DownstreamContentSize":0,"DownstreamStatus":304,"Duration":14729375,"OriginContentSize":0,"OriginDuration":14051833,"OriginStatus":304,"Overhead":677542,"RequestAddr":"s222-umami-c381af.traefik.me","RequestContentSize":0,"RequestCount":122,"RequestHost":"s222-umami-c381af.traefik.me","RequestMethod":"GET","RequestPath":"/dashboard?_rsc=1rugv","RequestPort":"-","RequestProtocol":"HTTP/1.1","RequestScheme":"http","RetryAttempts":0,"RouterName":"s222-umami-60e104-47-web@docker","ServiceAddr":"10.0.1.15:3000","ServiceName":"s222-umami-60e104-47-web@docker","ServiceURL":{"Scheme":"http","Opaque":"","User":null,"Host":"10.0.1.15:3000","Path":"","RawPath":"","ForceQuery":false,"RawQuery":"","Fragment":"","RawFragment":""},"StartLocal":"2024-08-25T04:34:37.306691884Z","StartUTC":"2024-08-25T04:34:37.306691884Z","entryPointName":"web","level":"info","msg":"","time":"2024-08-25T04:34:37Z"}`;

describe("processLogs", () => {
	it("should process a single log entry correctly", async () => {
		const tmpFile = temporaryFile();
		fs.writeFileSync(tmpFile, sampleLogEntry);

		const result = await calculateRequestsStatistics(tmpFile);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			hour: "2024-08-25T04:00:00Z",
			count: 1,
		});
	});

	it("should process multiple log entries and group by hour", async () => {
		const sampleLogEntry = `{"ClientAddr":"172.19.0.1:58094","ClientHost":"172.19.0.1","ClientPort":"58094","ClientUsername":"-","DownstreamContentSize":50,"DownstreamStatus":200,"Duration":35914250,"OriginContentSize":50,"OriginDuration":35817959,"OriginStatus":200,"Overhead":96291,"RequestAddr":"s222-pocketbase-f4a6e5.traefik.me","RequestContentSize":0,"RequestCount":991,"RequestHost":"s222-pocketbase-f4a6e5.traefik.me","RequestMethod":"GET","RequestPath":"/api/logs/stats?filter=","RequestPort":"-","RequestProtocol":"HTTP/1.1","RequestScheme":"http","RetryAttempts":0,"RouterName":"s222-pocketbase-e94e25-44-web@docker","ServiceAddr":"10.0.1.12:80","ServiceName":"s222-pocketbase-e94e25-44-web@docker","ServiceURL":{"Scheme":"http","Opaque":"","User":null,"Host":"10.0.1.12:80","Path":"","RawPath":"","ForceQuery":false,"RawQuery":"","Fragment":"","RawFragment":""},"StartLocal":"2024-08-25T17:44:29.274072471Z","StartUTC":"2024-08-25T17:44:29.274072471Z","entryPointName":"web","level":"info","msg":"","time":"2024-08-25T17:44:29Z"}
{"ClientAddr":"172.19.0.1:58108","ClientHost":"172.19.0.1","ClientPort":"58108","ClientUsername":"-","DownstreamContentSize":30975,"DownstreamStatus":200,"Duration":31406458,"OriginContentSize":30975,"OriginDuration":31046791,"OriginStatus":200,"Overhead":359667,"RequestAddr":"s222-pocketbase-f4a6e5.traefik.me","RequestContentSize":0,"RequestCount":992,"RequestHost":"s222-pocketbase-f4a6e5.traefik.me","RequestMethod":"GET","RequestPath":"/api/logs?page=1\u0026perPage=50\u0026sort=-rowid\u0026skipTotal=1\u0026filter=","RequestPort":"-","RequestProtocol":"HTTP/1.1","RequestScheme":"http","RetryAttempts":0,"RouterName":"s222-pocketbase-e94e25-44-web@docker","ServiceAddr":"10.0.1.12:80","ServiceName":"s222-pocketbase-e94e25-44-web@docker","ServiceURL":{"Scheme":"http","Opaque":"","User":null,"Host":"10.0.1.12:80","Path":"","RawPath":"","ForceQuery":false,"RawQuery":"","Fragment":"","RawFragment":""},"StartLocal":"2024-08-25T17:44:29.278990221Z","StartUTC":"2024-08-25T17:44:29.278990221Z","entryPointName":"web","level":"info","msg":"","time":"2024-08-25T17:44:29Z"}
`;
		const tmpFile = temporaryFile();
		fs.writeFileSync(tmpFile, sampleLogEntry);
		const result = await calculateRequestsStatistics(tmpFile);
		expect(result).toHaveLength(1);
		expect(result).toEqual([{ hour: "2024-08-25T17:00:00Z", count: 2 }]);
	});

	it("should return an empty array for empty input", async () => {
		const tmpFile = temporaryFile();
		fs.writeFileSync(tmpFile, "");
		expect(await calculateRequestsStatistics(tmpFile)).toEqual([]);
		expect(await parseLogs(tmpFile)).toEqual({ data: [], totalCount: 0 });
	});

	it("should parse a single log entry correctly", async () => {
		const tmpFile = temporaryFile();
		fs.writeFileSync(tmpFile, sampleLogEntry);
		const result = await parseLogs(tmpFile);
		expect(result.data).toHaveLength(1);
		expect(result.data[0]).toHaveProperty("ClientAddr", "172.19.0.1:56732");
		expect(result.data[0]).toHaveProperty(
			"StartUTC",
			"2024-08-25T04:34:37.306691884Z",
		);
	});

	it("should parse multiple log entries", async () => {
		const multipleEntries = `${sampleLogEntry}\n${sampleLogEntry}`;
		const tmpFile = temporaryFile();
		fs.writeFileSync(tmpFile, multipleEntries);

		const result = await parseLogs(tmpFile);
		expect(result.data).toHaveLength(2);

		for (const entry of result.data) {
			expect(entry).toHaveProperty("ClientAddr", "172.19.0.1:56732");
		}
	});

	it("should handle whitespace and empty lines", async () => {
		const entryWithWhitespace = `\n${sampleLogEntry}\n\n${sampleLogEntry}\n`;
		const tmpFile = temporaryFile();
		fs.writeFileSync(tmpFile, entryWithWhitespace);
		const result = await parseLogs(tmpFile);
		expect(result.data).toHaveLength(2);
	});

	it("should handle pagination", async () => {
		const logEntry = JSON.parse(sampleLogEntry);
		const date = new Date("2000-01-01T00:00:00.000Z");
		const data = Array(5)
			.fill(0)
			.map((_, idx) => {
				return JSON.stringify({
					...logEntry,
					time: new Date(date.getTime() + idx * 60000),
				});
			})
			.join("\n");
		const tmpFile = temporaryFile();
		fs.writeFileSync(tmpFile, data);

		const page1 = await parseLogs(tmpFile, {
			pageIndex: 0,
			pageSize: 2,
		});
		expect(page1.totalCount).toEqual(4);
		expect(page1.data).toHaveLength(2);
		expect(page1.data[0]!.time).toEqual("2000-01-01T00:04:00.000Z");
		expect(page1.data[1]!.time).toEqual("2000-01-01T00:03:00.000Z");

		const page2 = await parseLogs(tmpFile, {
			pageIndex: 1,
			pageSize: 2,
		});
		expect(page2.totalCount).toEqual(6);
		expect(page2.data).toHaveLength(2);
		expect(page2.data[0]!.time).toEqual("2000-01-01T00:02:00.000Z");
		expect(page2.data[1]!.time).toEqual("2000-01-01T00:01:00.000Z");

		const page3 = await parseLogs(tmpFile, {
			pageIndex: 2,
			pageSize: 2,
		});

		expect(page3.totalCount).toEqual(5);
		expect(page3.data).toHaveLength(1);
		expect(page3.data[0]!.time).toEqual("2000-01-01T00:00:00.000Z");
	});

	it("should handle sorting", async () => {
		const logEntry = JSON.parse(sampleLogEntry);
		const date = new Date("2000-01-01T00:00:00.000Z");
		const data = Array(5)
			.fill(0)
			.map((_, idx) => {
				return JSON.stringify({
					...logEntry,
					time: new Date(date.getTime() + idx * 60000),
				});
			})
			.join("\n");
		const tmpFile = temporaryFile();
		fs.writeFileSync(tmpFile, data);

		const pageDefaultSort = await parseLogs(tmpFile, {
			pageIndex: 0,
			pageSize: 100,
		});
		expect(pageDefaultSort.data).toHaveLength(5);
		expect(pageDefaultSort.data[0]!.time).toEqual("2000-01-01T00:04:00.000Z");
		expect(pageDefaultSort.data[4]!.time).toEqual("2000-01-01T00:00:00.000Z");

		const pageTimeAsc = await parseLogs(
			tmpFile,
			{
				pageIndex: 0,
				pageSize: 100,
			},
			{
				id: "time",
				desc: false,
			},
		);
		expect(pageTimeAsc.data).toHaveLength(5);
		expect(pageTimeAsc.data[0]!.time).toEqual("2000-01-01T00:00:00.000Z");
		expect(pageTimeAsc.data[4]!.time).toEqual("2000-01-01T00:04:00.000Z");

		const pageTimeDesc = await parseLogs(
			tmpFile,
			{
				pageIndex: 0,
				pageSize: 100,
			},
			{
				id: "time",
				desc: true,
			},
		);
		expect(pageTimeDesc.data).toHaveLength(5);

		expect(pageTimeDesc.data[0]!.time).toEqual("2000-01-01T00:04:00.000Z");
		expect(pageTimeDesc.data[4]!.time).toEqual("2000-01-01T00:00:00.000Z");
	});

	it("should handle search", async () => {
		const logEntry = JSON.parse(sampleLogEntry);
		const date = new Date("2000-01-01T00:00:00.000Z");
		const data = Array(5)
			.fill(0)
			.map((_, idx) => {
				return JSON.stringify({
					...logEntry,
					time: new Date(date.getTime() + idx * 60000),
					RequestPath: `/${idx % 2 ? "odd" : "even"}/${idx}`,
				});
			})
			.join("\n");
		const tmpFile = temporaryFile();
		fs.writeFileSync(tmpFile, data);

		const defaultSearch = await parseLogs(
			tmpFile,
			{
				pageIndex: 0,
				pageSize: 100,
			},
			undefined,
			"",
		);

		expect(defaultSearch.data).toHaveLength(5);

		const evenSearch = await parseLogs(
			tmpFile,
			{
				pageIndex: 0,
				pageSize: 100,
			},
			undefined,
			"even",
		);
		expect(evenSearch.data).toHaveLength(3);
		expect(evenSearch.data[0]!.RequestPath).toEqual("/even/4");
		expect(evenSearch.data[1]!.RequestPath).toEqual("/even/2");

		const oddSearch = await parseLogs(
			tmpFile,
			{
				pageIndex: 0,
				pageSize: 100,
			},
			undefined,
			"odd",
		);
		expect(oddSearch.totalCount).toEqual(2);
		expect(oddSearch.data).toHaveLength(2);
		expect(oddSearch.data[0]!.RequestPath).toEqual("/odd/3");
		expect(oddSearch.data[1]!.RequestPath).toEqual("/odd/1");
	});

	it("should filter by status", async () => {
		const logEntry = JSON.parse(sampleLogEntry);
		const data = Array(10)
			.fill(0)
			.map((_, idx) => {
				return JSON.stringify({
					...logEntry,
					DownstreamStatus: ((idx % 5) + 1) * 100 + idx,
				});
			})
			.join("\n");
		const tmpFile = temporaryFile();
		fs.writeFileSync(tmpFile, data);

		const success = await parseLogs(
			tmpFile,
			{
				pageIndex: 0,
				pageSize: 100,
			},
			undefined,
			undefined,
			["success"],
		);

		expect(success.data).toHaveLength(2);
		expect(success.data[0]!.DownstreamStatus).toEqual(206);
		expect(success.data[1]!.DownstreamStatus).toEqual(201);

		const server = await parseLogs(
			tmpFile,
			{
				pageIndex: 0,
				pageSize: 100,
			},
			undefined,
			undefined,
			["server"],
		);

		expect(server.data).toHaveLength(2);
		expect(server.data[0]!.DownstreamStatus).toEqual(509);
		expect(server.data[1]!.DownstreamStatus).toEqual(504);
	});
});
