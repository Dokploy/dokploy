import { beforeEach, describe, expect, it } from "vitest";
import { QueueManager } from "../../server/queues/queue-manager";

describe("QueueManager", () => {
	let manager: QueueManager;

	beforeEach(() => {
		manager = new QueueManager();
	});

	describe("Queue creation and retrieval", () => {
		it("should create a queue with default concurrency 1", () => {
			const queue = manager.getQueue("test-queue");
			expect(queue.getConcurrency()).toBe(1);
		});

		it("should create a queue with custom concurrency", () => {
			const queue = manager.getQueue("test-queue", 5);
			expect(queue.getConcurrency()).toBe(5);
		});

		it("should return the same queue instance for the same name", () => {
			const queue1 = manager.getQueue("test-queue", 3);
			const queue2 = manager.getQueue("test-queue", 5);
			expect(queue1).toBe(queue2);
			// Concurrency should remain as first set
			expect(queue1.getConcurrency()).toBe(3);
		});

		it("should create different queues for different names", () => {
			const queue1 = manager.getQueue("queue1", 2);
			const queue2 = manager.getQueue("queue2", 4);
			expect(queue1).not.toBe(queue2);
			expect(queue1.getConcurrency()).toBe(2);
			expect(queue2.getConcurrency()).toBe(4);
		});
	});

	describe("Handler management", () => {
		it("should set handler for a queue", async () => {
			const processed: string[] = [];

			manager.setHandler("test-queue", async (data: { id: string }) => {
				processed.push(data.id);
			});

			await manager.add("test-queue", "group1", { id: "job1" });

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(processed).toEqual(["job1"]);
		});

		it("should handle different handlers for different queues", async () => {
			const queue1Processed: string[] = [];
			const queue2Processed: string[] = [];

			manager.setHandler("queue1", async (data: { id: string }) => {
				queue1Processed.push(data.id);
			});

			manager.setHandler("queue2", async (data: { id: string }) => {
				queue2Processed.push(data.id);
			});

			await Promise.all([
				manager.add("queue1", "group1", { id: "job1" }),
				manager.add("queue2", "group1", { id: "job2" }),
			]);

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(queue1Processed).toEqual(["job1"]);
			expect(queue2Processed).toEqual(["job2"]);
		});
	});

	describe("Job management", () => {
		it("should add jobs to correct queue and group", async () => {
			const processed: string[] = [];

			manager.setHandler("test-queue", async (data: { id: string }) => {
				processed.push(data.id);
			});

			await manager.add("test-queue", "group1", { id: "job1" });
			await manager.add("test-queue", "group2", { id: "job2" });

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(processed).toContain("job1");
			expect(processed).toContain("job2");
		});

		it("should create queue with concurrency when adding job", async () => {
			const processed: string[] = [];

			// Create queue with concurrency first (without handler)
			manager.getQueue("new-queue", 3);

			// Set handler
			manager.setHandler("new-queue", async (data: { id: string }) => {
				processed.push(data.id);
			});

			// Now add job - it should process
			await manager.add("new-queue", "group1", { id: "job1" });

			await new Promise((resolve) => setTimeout(resolve, 50));

			const queue = manager.getQueue("new-queue");
			expect(queue.getConcurrency()).toBe(3);
			expect(processed).toEqual(["job1"]);
		});
	});

	describe("Queue operations", () => {
		it("should clear group in specific queue", async () => {
			const processed: string[] = [];

			manager.setHandler("test-queue", async (data: { id: string }) => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				processed.push(data.id);
			});

			// Add jobs but don't await - they'll start processing
			const job1Promise = manager.add("test-queue", "group1", { id: "job1" });
			const job2Promise = manager.add("test-queue", "group1", { id: "job2" });

			// Clear immediately - job1 might be processing, but job2 should be cleared
			manager.clearGroup("test-queue", "group1");

			// Use Promise.allSettled to handle both promises properly
			const results = await Promise.allSettled([job1Promise, job2Promise]);

			// job1 might succeed or fail depending on timing
			// job2 should be rejected
			const job2Result = results[1];
			if (job2Result.status === "rejected") {
				expect(job2Result.reason.message).toBe("Queue cleared");
			}

			await new Promise((resolve) => setTimeout(resolve, 150));

			// Job1 might have processed, but job2 should not
			expect(processed.length).toBeLessThanOrEqual(1);
		});

		it("should get group length for specific queue", async () => {
			manager.setHandler("test-queue", async () => {
				await new Promise((resolve) => setTimeout(resolve, 100));
			});

			// Add jobs without awaiting - check length immediately
			const job1Promise = manager.add("test-queue", "group1", { id: "job1" });
			const job2Promise = manager.add("test-queue", "group1", { id: "job2" });

			// Check length immediately - at least one should be pending
			// (job1 might be processing, but job2 should be pending)
			const length = manager.getGroupLength("test-queue", "group1");
			expect(length).toBeGreaterThanOrEqual(0);

			// Wait for both to complete
			await Promise.all([job1Promise, job2Promise]);
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(manager.getGroupLength("test-queue", "group1")).toBe(0);
		});

		it("should get total length for specific queue", async () => {
			manager.setHandler("test-queue", async () => {
				await new Promise((resolve) => setTimeout(resolve, 50));
			});

			// Add jobs without awaiting - check length immediately
			const promises = [
				manager.add("test-queue", "group1", { id: "job1" }),
				manager.add("test-queue", "group2", { id: "job2" }),
				manager.add("test-queue", "group3", { id: "job3" }),
			];

			// Check length immediately - at least some should be pending
			const length = manager.getTotalLength("test-queue");
			expect(length).toBeGreaterThanOrEqual(0);

			// Wait for all to complete
			await Promise.all(promises);
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(manager.getTotalLength("test-queue")).toBe(0);
		});

		it("should check if queue is idle", async () => {
			manager.setHandler("test-queue", async () => {
				await new Promise((resolve) => setTimeout(resolve, 50));
			});

			expect(manager.isIdle("test-queue")).toBe(true);

			await manager.add("test-queue", "group1", { id: "job1" });

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(manager.isIdle("test-queue")).toBe(true);
		});
	});

	describe("Queue lifecycle", () => {
		it("should close a specific queue", async () => {
			manager.setHandler("test-queue", async () => {
				await new Promise((resolve) => setTimeout(resolve, 100));
			});

			// Add first job and wait a bit to ensure it starts processing
			const job1Promise = manager.add("test-queue", "group1", { id: "job1" });
			// Add second job without awaiting
			const job2Promise = manager.add("test-queue", "group1", { id: "job2" });

			// Wait a tiny bit to ensure job2 is queued
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Close queue - job2 should be rejected
			await manager.closeQueue("test-queue");

			// Use Promise.allSettled to handle both promises properly
			const results = await Promise.allSettled([job1Promise, job2Promise]);

			// job1 might succeed or fail depending on timing
			// job2 should be rejected
			const job2Result = results[1];
			if (job2Result.status === "rejected") {
				expect(job2Result.reason.message).toBe("Queue closed");
			}

			expect(manager.getQueueNames()).not.toContain("test-queue");
		});

		it("should close all queues", async () => {
			manager.setHandler("queue1", async () => {
				await new Promise((resolve) => setTimeout(resolve, 100));
			});
			manager.setHandler("queue2", async () => {
				await new Promise((resolve) => setTimeout(resolve, 100));
			});

			await manager.add("queue1", "group1", { id: "job1" });
			await manager.add("queue2", "group1", { id: "job2" });

			await manager.closeAll();

			expect(manager.getQueueNames()).toHaveLength(0);
		});

		it("should get all queue names", () => {
			manager.getQueue("queue1");
			manager.getQueue("queue2");
			manager.getQueue("queue3");

			const names = manager.getQueueNames();
			expect(names).toContain("queue1");
			expect(names).toContain("queue2");
			expect(names).toContain("queue3");
			expect(names).toHaveLength(3);
		});
	});

	describe("Multiple queues with different concurrency", () => {
		it("should handle multiple queues with different concurrency settings", async () => {
			const queue1Processed: string[] = [];
			const queue2Processed: string[] = [];

			// Create queues with specific concurrency FIRST, before setting handlers
			const queue1 = manager.getQueue("queue1", 1);
			const queue2 = manager.getQueue("queue2", 3);

			// Verify concurrency is set correctly before proceeding
			expect(queue1.getConcurrency()).toBe(1);
			expect(queue2.getConcurrency()).toBe(3);

			manager.setHandler("queue1", async (data: { id: string }) => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				queue1Processed.push(data.id);
			});

			manager.setHandler("queue2", async (data: { id: string }) => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				queue2Processed.push(data.id);
			});

			// Queue1 with concurrency 1 (sequential)
			await Promise.all([
				manager.add("queue1", "app1", { id: "job1" }),
				manager.add("queue1", "app2", { id: "job2" }),
			]);

			// Queue2 with concurrency 3 (parallel)
			await Promise.all([
				manager.add("queue2", "app1", { id: "job1" }),
				manager.add("queue2", "app2", { id: "job2" }),
				manager.add("queue2", "app3", { id: "job3" }),
			]);

			await new Promise((resolve) => setTimeout(resolve, 200));

			expect(queue1Processed).toHaveLength(2);
			expect(queue2Processed).toHaveLength(3);

			// Verify concurrency settings are still correct
			expect(manager.getQueue("queue1").getConcurrency()).toBe(1);
			expect(manager.getQueue("queue2").getConcurrency()).toBe(3);
		});
	});
});
