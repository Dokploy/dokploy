import { beforeEach, describe, expect, it, vi } from "vitest";

type HasInput = { input: any };

const {
	send,
	Route53Client,
	ListHostedZonesCommand,
	ListResourceRecordSetsCommand,
	ChangeResourceRecordSetsCommand,
} = vi.hoisted(() => {
	class FakeCommand {
		input: any;
		constructor(input: any) {
			this.input = input;
		}
	}
	const send = vi.fn();
	class Route53Client {
		send(command: unknown) {
			return send(command);
		}
	}
	return {
		send,
		Route53Client,
		ListHostedZonesCommand: class extends FakeCommand {},
		ListResourceRecordSetsCommand: class extends FakeCommand {},
		ChangeResourceRecordSetsCommand: class extends FakeCommand {},
	};
});

vi.mock("@aws-sdk/client-route-53", () => ({
	Route53Client,
	ListHostedZonesCommand,
	ListResourceRecordSetsCommand,
	ChangeResourceRecordSetsCommand,
}));

import { route53Client } from "@dokploy/server/utils/dns/route53";

const config = {
	providerType: "route53" as const,
	accessKeyId: "AKIA_TEST",
	secretAccessKey: "secret",
};

beforeEach(() => {
	send.mockReset();
});

describe("route53Client.listZones", () => {
	it("strips the hostedzone prefix and the trailing dot", async () => {
		send.mockResolvedValueOnce({
			HostedZones: [{ Id: "/hostedzone/Z123", Name: "example.com." }],
			IsTruncated: false,
		});

		const zones = await route53Client.listZones(config);

		expect(zones).toEqual([{ id: "Z123", name: "example.com" }]);
	});

	it("follows the marker until IsTruncated is false", async () => {
		send
			.mockResolvedValueOnce({
				HostedZones: [{ Id: "/hostedzone/Z1", Name: "a.com." }],
				IsTruncated: true,
				NextMarker: "marker-1",
			})
			.mockResolvedValueOnce({
				HostedZones: [{ Id: "/hostedzone/Z2", Name: "b.com." }],
				IsTruncated: false,
			});

		const zones = await route53Client.listZones(config);

		expect(zones).toEqual([
			{ id: "Z1", name: "a.com" },
			{ id: "Z2", name: "b.com" },
		]);
		expect(send).toHaveBeenCalledTimes(2);
		expect((send.mock.calls[1]?.[0] as HasInput).input.Marker).toBe("marker-1");
	});
});

describe("route53Client.listRecords", () => {
	it("builds a type:name id and strips the trailing dot from the name", async () => {
		send.mockResolvedValueOnce({
			ResourceRecordSets: [
				{
					Name: "app.example.com.",
					Type: "A",
					TTL: 300,
					ResourceRecords: [{ Value: "1.2.3.4" }],
				},
			],
			IsTruncated: false,
		});

		const records = await route53Client.listRecords(config, "Z123");

		expect(records).toEqual([
			{
				id: "A:app.example.com",
				type: "A",
				name: "app.example.com",
				content: "1.2.3.4",
				ttl: 300,
			},
		]);
	});

	it("skips record sets with no ResourceRecords (e.g. alias targets)", async () => {
		send.mockResolvedValueOnce({
			ResourceRecordSets: [
				{ Name: "alias.example.com.", Type: "A", ResourceRecords: [] },
			],
			IsTruncated: false,
		});

		const records = await route53Client.listRecords(config, "Z123");

		expect(records).toEqual([]);
	});

	it("joins multiple values for the same record", async () => {
		send.mockResolvedValueOnce({
			ResourceRecordSets: [
				{
					Name: "example.com.",
					Type: "NS",
					TTL: 172800,
					ResourceRecords: [
						{ Value: "ns1.example.com" },
						{ Value: "ns2.example.com" },
					],
				},
			],
			IsTruncated: false,
		});

		const records = await route53Client.listRecords(config, "Z123");

		expect(records[0]?.content).toBe("ns1.example.com\nns2.example.com");
	});
});

describe("route53Client.upsertRecord", () => {
	it("sends a single UPSERT change when nothing exists yet", async () => {
		send
			.mockResolvedValueOnce({ ResourceRecordSets: [] })
			.mockResolvedValueOnce({});

		const result = await route53Client.upsertRecord(config, {
			zoneId: "Z123",
			type: "A",
			name: "app.example.com",
			content: "1.2.3.4",
		});

		expect(result).toEqual({ id: "A:app.example.com" });
		const command = send.mock.calls[1]?.[0] as HasInput;
		expect(command.input.HostedZoneId).toBe("Z123");
		expect(command.input.ChangeBatch.Changes).toEqual([
			{
				Action: "UPSERT",
				ResourceRecordSet: {
					Name: "app.example.com.",
					Type: "A",
					TTL: 300,
					ResourceRecords: [{ Value: "1.2.3.4" }],
				},
			},
		]);
	});

	it("keeps the values already in the record set", async () => {
		send
			.mockResolvedValueOnce({
				ResourceRecordSets: [
					{
						Name: "app.example.com.",
						Type: "A",
						TTL: 300,
						ResourceRecords: [{ Value: "1.1.1.1" }, { Value: "2.2.2.2" }],
					},
				],
			})
			.mockResolvedValueOnce({});

		await route53Client.upsertRecord(config, {
			zoneId: "Z123",
			type: "A",
			name: "app.example.com",
			content: "3.3.3.3",
		});

		const command = send.mock.calls[1]?.[0] as HasInput;
		expect(
			command.input.ChangeBatch.Changes[0].ResourceRecordSet.ResourceRecords,
		).toEqual([
			{ Value: "1.1.1.1" },
			{ Value: "2.2.2.2" },
			{ Value: "3.3.3.3" },
		]);
	});

	it("does not duplicate a value that is already in the record set", async () => {
		send
			.mockResolvedValueOnce({
				ResourceRecordSets: [
					{
						Name: "app.example.com.",
						Type: "A",
						TTL: 300,
						ResourceRecords: [{ Value: "1.1.1.1" }],
					},
				],
			})
			.mockResolvedValueOnce({});

		await route53Client.upsertRecord(config, {
			zoneId: "Z123",
			type: "A",
			name: "app.example.com",
			content: "1.1.1.1",
		});

		const command = send.mock.calls[1]?.[0] as HasInput;
		expect(
			command.input.ChangeBatch.Changes[0].ResourceRecordSet.ResourceRecords,
		).toEqual([{ Value: "1.1.1.1" }]);
	});

	it("wraps unquoted TXT values in double quotes", async () => {
		send
			.mockResolvedValueOnce({ ResourceRecordSets: [] })
			.mockResolvedValueOnce({});

		await route53Client.upsertRecord(config, {
			zoneId: "Z123",
			type: "TXT",
			name: "example.com",
			content: 'v=spf1 ~all\n"already quoted"',
		});

		const command = send.mock.calls[1]?.[0] as HasInput;
		expect(
			command.input.ChangeBatch.Changes[0].ResourceRecordSet.ResourceRecords,
		).toEqual([{ Value: '"v=spf1 ~all"' }, { Value: '"already quoted"' }]);
	});
});

describe("route53Client.updateRecord", () => {
	it("only UPSERTs when the name/type identity did not change", async () => {
		send.mockResolvedValueOnce({});

		await route53Client.updateRecord(config, "Z123", "A:app.example.com", {
			type: "A",
			name: "app.example.com",
			content: "9.9.9.9",
		});

		expect(send).toHaveBeenCalledTimes(1);
		const command = send.mock.calls[0]?.[0] as HasInput;
		expect(command.input.ChangeBatch.Changes).toHaveLength(1);
		expect(command.input.ChangeBatch.Changes[0].Action).toBe("UPSERT");
	});

	it("deletes the old record set and creates the new one on rename", async () => {
		const existingSet = {
			Name: "old.example.com.",
			Type: "A",
			TTL: 300,
			ResourceRecords: [{ Value: "1.1.1.1" }],
		};
		send
			.mockResolvedValueOnce({ ResourceRecordSets: [existingSet] }) // findExactRecordSet lookup
			.mockResolvedValueOnce({}); // ChangeResourceRecordSets

		await route53Client.updateRecord(config, "Z123", "A:old.example.com", {
			type: "A",
			name: "new.example.com",
			content: "1.1.1.1",
		});

		const changeCommand = send.mock.calls[1]?.[0] as HasInput;
		expect(changeCommand.input.ChangeBatch.Changes).toEqual([
			{ Action: "DELETE", ResourceRecordSet: existingSet },
			{
				Action: "UPSERT",
				ResourceRecordSet: {
					Name: "new.example.com.",
					Type: "A",
					TTL: 300,
					ResourceRecords: [{ Value: "1.1.1.1" }],
				},
			},
		]);
	});

	it("keeps every line of a multi-value record set", async () => {
		send.mockResolvedValueOnce({});

		await route53Client.updateRecord(config, "Z123", "NS:example.com", {
			type: "NS",
			name: "example.com",
			content: "ns1.example.com\nns2.example.com\n\n  ns3.example.com  ",
		});

		const command = send.mock.calls[0]?.[0] as HasInput;
		expect(
			command.input.ChangeBatch.Changes[0].ResourceRecordSet.ResourceRecords,
		).toEqual([
			{ Value: "ns1.example.com" },
			{ Value: "ns2.example.com" },
			{ Value: "ns3.example.com" },
		]);
	});

	it("skips the DELETE when the old record no longer exists", async () => {
		send
			.mockResolvedValueOnce({ ResourceRecordSets: [] })
			.mockResolvedValueOnce({});

		await route53Client.updateRecord(config, "Z123", "A:gone.example.com", {
			type: "A",
			name: "new.example.com",
			content: "1.1.1.1",
		});

		const changeCommand = send.mock.calls[1]?.[0] as HasInput;
		expect(changeCommand.input.ChangeBatch.Changes).toHaveLength(1);
		expect(changeCommand.input.ChangeBatch.Changes[0].Action).toBe("UPSERT");
	});
});

describe("route53Client.deleteRecord", () => {
	it("deletes the record set found by name/type", async () => {
		const existingSet = {
			Name: "app.example.com.",
			Type: "A",
			TTL: 300,
			ResourceRecords: [{ Value: "1.2.3.4" }],
		};
		send.mockResolvedValueOnce({ ResourceRecordSets: [existingSet] });
		send.mockResolvedValueOnce({});

		await route53Client.deleteRecord(config, "Z123", "A:app.example.com");

		const changeCommand = send.mock.calls[1]?.[0] as HasInput;
		expect(changeCommand.input.ChangeBatch.Changes).toEqual([
			{ Action: "DELETE", ResourceRecordSet: existingSet },
		]);
	});

	it("throws when the record no longer exists", async () => {
		send.mockResolvedValueOnce({ ResourceRecordSets: [] });

		await expect(
			route53Client.deleteRecord(config, "Z123", "A:gone.example.com"),
		).rejects.toThrow("not found");
	});

	it("throws for a malformed record id", async () => {
		await expect(
			route53Client.deleteRecord(config, "Z123", "not-a-valid-id"),
		).rejects.toThrow("Invalid Route53 record id");
	});
});

describe("route53Client.testConnection", () => {
	it("resolves when ListHostedZones succeeds", async () => {
		send.mockResolvedValueOnce({ HostedZones: [] });
		await expect(route53Client.testConnection(config)).resolves.toBeUndefined();
	});

	it("propagates SDK errors", async () => {
		send.mockRejectedValueOnce(new Error("InvalidClientTokenId"));
		await expect(route53Client.testConnection(config)).rejects.toThrow(
			"InvalidClientTokenId",
		);
	});
});
