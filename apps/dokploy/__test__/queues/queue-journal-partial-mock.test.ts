import { describe, expect, it, vi } from "vitest";

// A test that mocks "@dokploy/server" without the journal functions must still
// be able to load the queue: the journal resolves them per call, not at import.
vi.mock("@dokploy/server", () => ({ IS_CLOUD: true }));
vi.mock("../../server/sentry", () => ({ captureError: vi.fn() }));

import {
	createQueueJournal,
	dbJournalStore,
} from "../../server/queues/queue-journal";

describe("queue journal under a partial @dokploy/server mock", () => {
	it("imports without the journal exports", () => {
		expect(dbJournalStore).toBeDefined();
	});

	it("fails a journal write without throwing into the caller", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { journal } = createQueueJournal(dbJournalStore);

		await expect(
			journal.enqueued({
				journalId: "j1",
				data: {
					applicationId: "a",
					titleLog: "t",
					descriptionLog: "",
					type: "deploy",
					applicationType: "application",
				},
			} as Parameters<typeof journal.enqueued>[0]),
		).resolves.toBeUndefined();
	});
});
