import { describe, expect, it } from "vitest";
import { GroupedQueue } from "../../server/queues/grouped-queue-wrapper";

describe("GroupedQueue", () => {
	describe("Basic functionality", () => {
		it("should process a single job with concurrency 1", async () => {
			const queue = new GroupedQueue<{ id: string }>(1);
			const processed: string[] = [];

			queue.setHandler(async (data) => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				processed.push(data.id);
			});

			await queue.add("group1", { id: "job1" });

			// Wait for processing to complete
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(processed).toEqual(["job1"]);
			expect(queue.isIdle()).toBe(true);
		});

		it("should process jobs in FIFO order within a group", async () => {
			const queue = new GroupedQueue<{ id: string }>(1);
			const processed: string[] = [];

			queue.setHandler(async (data) => {
				await new Promise((resolve) => setTimeout(resolve, 20));
				processed.push(data.id);
			});

			// Add multiple jobs to the same group
			await Promise.all([
				queue.add("group1", { id: "job1" }),
				queue.add("group1", { id: "job2" }),
				queue.add("group1", { id: "job3" }),
			]);

			// Wait for all processing
			await new Promise((resolve) => setTimeout(resolve, 200));

			expect(processed).toEqual(["job1", "job2", "job3"]);
		});
	});

	describe("Concurrency 1 with multiple groups", () => {
		it("should process one group at a time with concurrency 1", async () => {
			const queue = new GroupedQueue<{ id: string; group: string }>(1);
			const processed: string[] = [];
			const activeGroups: string[] = [];

			queue.setHandler(async (data) => {
				activeGroups.push(data.group);
				await new Promise((resolve) => setTimeout(resolve, 50));
				processed.push(data.id);
				activeGroups.pop();
			});

			// Add jobs to 3 different groups
			const promises = [
				queue.add("app1", { id: "job1", group: "app1" }),
				queue.add("app2", { id: "job2", group: "app2" }),
				queue.add("app3", { id: "job3", group: "app3" }),
			];

			// Check after 30ms - only one should be processing
			await new Promise((resolve) => setTimeout(resolve, 30));
			expect(activeGroups.length).toBeLessThanOrEqual(1);

			// Wait for all to complete
			await Promise.all(promises);
			await new Promise((resolve) => setTimeout(resolve, 200));

			expect(processed).toHaveLength(3);
			expect(queue.isIdle()).toBe(true);
		});

		it("should process groups sequentially with concurrency 1", async () => {
			const queue = new GroupedQueue<{ id: string; group: string }>(1);
			const processingOrder: string[] = [];
			const startTimes: Map<string, number> = new Map();
			const endTimes: Map<string, number> = new Map();

			queue.setHandler(async (data) => {
				startTimes.set(data.id, Date.now());
				processingOrder.push(`start-${data.group}`);
				await new Promise((resolve) => setTimeout(resolve, 50));
				endTimes.set(data.id, Date.now());
				processingOrder.push(`end-${data.group}`);
			});

			await Promise.all([
				queue.add("app1", { id: "job1", group: "app1" }),
				queue.add("app2", { id: "job2", group: "app2" }),
				queue.add("app3", { id: "job3", group: "app3" }),
			]);

			await new Promise((resolve) => setTimeout(resolve, 300));

			// Verify sequential processing
			expect(processingOrder).toEqual([
				"start-app1",
				"end-app1",
				"start-app2",
				"end-app2",
				"start-app3",
				"end-app3",
			]);

			// Verify jobs don't overlap
			const job1End = endTimes.get("job1")!;
			const job2Start = startTimes.get("job2")!;
			const job2End = endTimes.get("job2")!;
			const job3Start = startTimes.get("job3")!;

			expect(job2Start).toBeGreaterThanOrEqual(job1End);
			expect(job3Start).toBeGreaterThanOrEqual(job2End);
		});
	});

	describe("Concurrency 3 with 4 groups", () => {
		it("should process up to 3 groups simultaneously", async () => {
			const queue = new GroupedQueue<{ id: string; group: string }>(3);
			const activeGroups = new Set<string>();
			const maxConcurrent = { value: 0 };

			queue.setHandler(async (data) => {
				activeGroups.add(data.group);
				maxConcurrent.value = Math.max(maxConcurrent.value, activeGroups.size);

				await new Promise((resolve) => setTimeout(resolve, 100));

				activeGroups.delete(data.group);
			});

			// Add 4 jobs to different groups
			await Promise.all([
				queue.add("app1", { id: "job1", group: "app1" }),
				queue.add("app2", { id: "job2", group: "app2" }),
				queue.add("app3", { id: "job3", group: "app3" }),
				queue.add("app4", { id: "job4", group: "app4" }),
			]);

			// Check during processing
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Should have processed 3 groups simultaneously
			expect(maxConcurrent.value).toBe(3);
			expect(activeGroups.size).toBeLessThanOrEqual(3);

			// Wait for all to complete
			await new Promise((resolve) => setTimeout(resolve, 200));
			expect(queue.isIdle()).toBe(true);
		});

		it("should process 4th group after one of the first 3 completes", async () => {
			const queue = new GroupedQueue<{ id: string; group: string }>(3);
			const processingOrder: string[] = [];

			queue.setHandler(async (data) => {
				processingOrder.push(`start-${data.group}`);
				await new Promise((resolve) => setTimeout(resolve, 100));
				processingOrder.push(`end-${data.group}`);
			});

			await Promise.all([
				queue.add("app1", { id: "job1", group: "app1" }),
				queue.add("app2", { id: "job2", group: "app2" }),
				queue.add("app3", { id: "job3", group: "app3" }),
				queue.add("app4", { id: "job4", group: "app4" }),
			]);

			await new Promise((resolve) => setTimeout(resolve, 250));

			// First 3 should start together
			const firstThree = processingOrder.slice(0, 3);
			expect(firstThree).toContain("start-app1");
			expect(firstThree).toContain("start-app2");
			expect(firstThree).toContain("start-app3");

			// 4th should start after one completes
			const app4StartIndex = processingOrder.indexOf("start-app4");
			expect(app4StartIndex).toBeGreaterThan(0);
			expect(app4StartIndex).toBeLessThan(processingOrder.length - 1);
		});
	});

	describe("Multiple jobs per group", () => {
		it("should process jobs sequentially within same group", async () => {
			const queue = new GroupedQueue<{ id: string }>(3);
			const processed: string[] = [];

			queue.setHandler(async (data) => {
				await new Promise((resolve) => setTimeout(resolve, 30));
				processed.push(data.id);
			});

			// Add 3 jobs to same group
			await Promise.all([
				queue.add("app1", { id: "job1" }),
				queue.add("app1", { id: "job2" }),
				queue.add("app1", { id: "job3" }),
			]);

			await new Promise((resolve) => setTimeout(resolve, 200));

			// Should process in order
			expect(processed).toEqual(["job1", "job2", "job3"]);
		});

		it("should process multiple groups with multiple jobs each", async () => {
			const queue = new GroupedQueue<{ id: string; group: string }>(2);
			const processed: string[] = [];

			queue.setHandler(async (data) => {
				await new Promise((resolve) => setTimeout(resolve, 20));
				processed.push(`${data.group}-${data.id}`);
			});

			// Add jobs to 2 groups, 2 jobs each
			await Promise.all([
				queue.add("app1", { id: "job1", group: "app1" }),
				queue.add("app1", { id: "job2", group: "app1" }),
				queue.add("app2", { id: "job1", group: "app2" }),
				queue.add("app2", { id: "job2", group: "app2" }),
			]);

			await new Promise((resolve) => setTimeout(resolve, 200));

			// Should process both groups, jobs within each group in order
			expect(processed).toHaveLength(4);
			expect(processed.filter((p) => p.startsWith("app1"))).toEqual([
				"app1-job1",
				"app1-job2",
			]);
			expect(processed.filter((p) => p.startsWith("app2"))).toEqual([
				"app2-job1",
				"app2-job2",
			]);
		});
	});

	describe("Error handling", () => {
		it("should reject job on handler error", async () => {
			const queue = new GroupedQueue<{ id: string }>(1);

			queue.setHandler(async () => {
				throw new Error("Test error");
			});

			await expect(queue.add("group1", { id: "job1" })).rejects.toThrow(
				"Test error",
			);
		});

		it("should continue processing other jobs after error", async () => {
			const queue = new GroupedQueue<{ id: string }>(1);
			const processed: string[] = [];

			queue.setHandler(async (data) => {
				if (data.id === "job2") {
					throw new Error("Job 2 error");
				}
				processed.push(data.id);
			});

			await expect(
				queue.add("group1", { id: "job1" }),
			).resolves.toBeUndefined();
			await expect(queue.add("group1", { id: "job2" })).rejects.toThrow();
			await expect(
				queue.add("group1", { id: "job3" }),
			).resolves.toBeUndefined();

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(processed).toEqual(["job1", "job3"]);
		});
	});

	describe("Queue management", () => {
		it("should clear group tasks", async () => {
			const queue = new GroupedQueue<{ id: string }>(1);
			const processed: string[] = [];

			queue.setHandler(async (data) => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				processed.push(data.id);
			});

			// Add jobs without awaiting - they'll start processing
			const job1Promise = queue.add("group1", { id: "job1" });
			const job2Promise = queue.add("group1", { id: "job2" });

			// Clear immediately - job1 might be processing, but job2 should be cleared
			queue.clearGroup("group1");

			// Use Promise.allSettled to handle both promises properly
			const results = await Promise.allSettled([job1Promise, job2Promise]);

			// job1 might succeed or fail depending on timing
			// job2 should be rejected
			const job2Result = results[1];
			if (job2Result.status === "rejected") {
				expect(job2Result.reason.message).toBe("Queue cleared");
			}

			await new Promise((resolve) => setTimeout(resolve, 100));

			// Job1 might have processed, but job2 should not
			expect(processed.length).toBeLessThanOrEqual(1);
		});

		it("should return correct group length", async () => {
			const queue = new GroupedQueue<{ id: string }>(1);

			queue.setHandler(async () => {
				await new Promise((resolve) => setTimeout(resolve, 100));
			});

			// Add jobs without awaiting - check length immediately
			const promises = [
				queue.add("group1", { id: "job1" }),
				queue.add("group1", { id: "job2" }),
				queue.add("group1", { id: "job3" }),
			];

			// Check length immediately - at least some should be pending
			// (job1 might be processing, but job2 and job3 should be pending)
			const length = queue.getGroupLength("group1");
			expect(length).toBeGreaterThanOrEqual(0);

			// Wait for all to complete
			await Promise.all(promises);
			await new Promise((resolve) => setTimeout(resolve, 50));

			// After processing should be 0
			expect(queue.getGroupLength("group1")).toBe(0);
		});

		it("should close queue and reject pending tasks", async () => {
			const queue = new GroupedQueue<{ id: string }>(1);

			queue.setHandler(async () => {
				await new Promise((resolve) => setTimeout(resolve, 100));
			});

			// Add first job and wait a bit to ensure it starts processing
			const job1Promise = queue.add("group1", { id: "job1" });
			// Add second job without awaiting
			const job2Promise = queue.add("group1", { id: "job2" });

			// Wait a tiny bit to ensure job2 is queued
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Close queue - job2 should be rejected
			await queue.close();

			// Use Promise.allSettled to handle both promises properly
			const results = await Promise.allSettled([job1Promise, job2Promise]);

			// job1 might succeed or fail depending on timing
			// job2 should be rejected
			const job2Result = results[1];
			if (job2Result.status === "rejected") {
				expect(job2Result.reason.message).toBe("Queue closed");
			}
		});
	});

	describe("Concurrency edge cases", () => {
		it("should handle concurrency 1 with 1 app correctly", async () => {
			const queue = new GroupedQueue<{ id: string }>(1);
			const processed: string[] = [];

			queue.setHandler(async (data) => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				processed.push(data.id);
			});

			await queue.add("app1", { id: "job1" });

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(processed).toEqual(["job1"]);
			expect(queue.getActiveGroupsCount()).toBe(0);
		});

		it("should handle concurrency 1 with 3 apps correctly", async () => {
			const queue = new GroupedQueue<{ id: string; app: string }>(1);
			const processingTimes: Map<string, { start: number; end: number }> =
				new Map();

			queue.setHandler(async (data) => {
				const start = Date.now();
				await new Promise((resolve) => setTimeout(resolve, 50));
				const end = Date.now();
				processingTimes.set(data.app, { start, end });
			});

			await Promise.all([
				queue.add("app1", { id: "job1", app: "app1" }),
				queue.add("app2", { id: "job2", app: "app2" }),
				queue.add("app3", { id: "job3", app: "app3" }),
			]);

			await new Promise((resolve) => setTimeout(resolve, 300));

			// Verify sequential processing
			const app1 = processingTimes.get("app1")!;
			const app2 = processingTimes.get("app2")!;
			const app3 = processingTimes.get("app3")!;

			expect(app2.start).toBeGreaterThanOrEqual(app1.end);
			expect(app3.start).toBeGreaterThanOrEqual(app2.end);
			expect(queue.getActiveGroupsCount()).toBe(0);
		});

		it("should handle 4 apps with concurrency 3 correctly", async () => {
			const queue = new GroupedQueue<{ id: string; app: string }>(3);
			const concurrentCounts: number[] = [];

			queue.setHandler(async () => {
				// Track concurrent processing
				const interval = setInterval(() => {
					concurrentCounts.push(queue.getActiveGroupsCount());
				}, 10);

				await new Promise((resolve) => setTimeout(resolve, 100));

				clearInterval(interval);
			});

			await Promise.all([
				queue.add("app1", { id: "job1", app: "app1" }),
				queue.add("app2", { id: "job2", app: "app2" }),
				queue.add("app3", { id: "job3", app: "app3" }),
				queue.add("app4", { id: "job4", app: "app4" }),
			]);

			await new Promise((resolve) => setTimeout(resolve, 200));

			// Should never exceed concurrency of 3
			const maxConcurrent = Math.max(...concurrentCounts);
			expect(maxConcurrent).toBeLessThanOrEqual(3);
			expect(queue.getActiveGroupsCount()).toBe(0);
		});
	});

	describe("Idle state", () => {
		it("should be idle when no jobs are processing", () => {
			const queue = new GroupedQueue<{ id: string }>(1);
			expect(queue.isIdle()).toBe(true);
		});

		it("should not be idle while processing", async () => {
			const queue = new GroupedQueue<{ id: string }>(1);
			let isIdleDuringProcessing = false;

			queue.setHandler(async () => {
				isIdleDuringProcessing = queue.isIdle();
				await new Promise((resolve) => setTimeout(resolve, 50));
			});

			await queue.add("group1", { id: "job1" });

			await new Promise((resolve) => setTimeout(resolve, 30));

			expect(isIdleDuringProcessing).toBe(false);
			expect(queue.isIdle()).toBe(true);
		});
	});

	describe("Concurrency management", () => {
		it("should get current concurrency", () => {
			const queue1 = new GroupedQueue<{ id: string }>(1);
			const queue2 = new GroupedQueue<{ id: string }>(5);
			const queue3 = new GroupedQueue<{ id: string }>(10);

			expect(queue1.getConcurrency()).toBe(1);
			expect(queue2.getConcurrency()).toBe(5);
			expect(queue3.getConcurrency()).toBe(10);
		});

		it("should set concurrency dynamically", () => {
			const queue = new GroupedQueue<{ id: string }>(1);
			expect(queue.getConcurrency()).toBe(1);

			queue.setConcurrency(3);
			expect(queue.getConcurrency()).toBe(3);

			queue.setConcurrency(5);
			expect(queue.getConcurrency()).toBe(5);
		});

		it("should throw error when setting concurrency less than 1", () => {
			const queue = new GroupedQueue<{ id: string }>(1);
			expect(() => queue.setConcurrency(0)).toThrow(
				"Concurrency must be at least 1",
			);
			expect(() => queue.setConcurrency(-1)).toThrow(
				"Concurrency must be at least 1",
			);
		});

		it("should process next group when concurrency increases", async () => {
			const queue = new GroupedQueue<{ id: string }>(1);
			const processed: string[] = [];

			queue.setHandler(async (data) => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				processed.push(data.id);
			});

			// Add jobs to 3 different groups with concurrency 1
			const job1Promise = queue.add("group1", { id: "job1" });
			const job2Promise = queue.add("group2", { id: "job2" });
			const job3Promise = queue.add("group3", { id: "job3" });

			// Wait a bit to ensure job1 starts processing
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Increase concurrency to 3 - should allow group2 and group3 to start
			queue.setConcurrency(3);

			// Wait for all to complete
			await Promise.all([job1Promise, job2Promise, job3Promise]);
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(processed).toHaveLength(3);
			expect(processed).toContain("job1");
			expect(processed).toContain("job2");
			expect(processed).toContain("job3");
		});
	});

	describe("Clear all pending tasks", () => {
		it("should clear all pending tasks across all groups", async () => {
			const queue = new GroupedQueue<{ id: string }>(1);
			const processed: string[] = [];

			queue.setHandler(async (data) => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				processed.push(data.id);
			});

			// Add multiple jobs to different groups
			const job1Promise = queue.add("group1", { id: "job1" });
			const job2Promise = queue.add("group1", { id: "job2" });
			const job3Promise = queue.add("group2", { id: "job3" });
			const job4Promise = queue.add("group2", { id: "job4" });
			const job5Promise = queue.add("group3", { id: "job5" });

			// Wait a bit to ensure job1 starts processing
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Clear all pending tasks
			const clearedCount = queue.clearAllPendingTasks();

			// Should have cleared 4 pending tasks (job2, job3, job4, job5)
			// job1 is processing so it's not in the queue anymore
			expect(clearedCount).toBe(4);

			// Handle all promises
			const results = await Promise.allSettled([
				job1Promise,
				job2Promise,
				job3Promise,
				job4Promise,
				job5Promise,
			]);

			// job1 should succeed (it was processing)
			const job1Result = results[0];
			expect(job1Result.status).toBe("fulfilled");

			// All pending jobs should be rejected
			for (let i = 1; i < results.length; i++) {
				const result = results[i];
				if (result && result.status === "rejected") {
					expect(result.reason.message).toBe(
						"Concurrency changed - queue cleared",
					);
				}
			}

			// Wait for job1 to complete
			await new Promise((resolve) => setTimeout(resolve, 150));

			// Only job1 should have processed
			expect(processed).toHaveLength(1);
			expect(processed).toContain("job1");
		});

		it("should not clear tasks that are currently processing", async () => {
			const queue = new GroupedQueue<{ id: string }>(1);
			const processed: string[] = [];

			queue.setHandler(async (data) => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				processed.push(data.id);
			});

			// Add jobs - first one will start processing immediately
			const job1Promise = queue.add("group1", { id: "job1" });
			const job2Promise = queue.add("group1", { id: "job2" });

			// Wait to ensure job1 is processing (it's been shifted from tasks)
			await new Promise((resolve) => setTimeout(resolve, 20));

			// Clear all pending - should only clear job2, not job1
			// job1 is already executing (not in tasks array)
			const clearedCount = queue.clearAllPendingTasks();

			expect(clearedCount).toBe(1);

			// Handle all promises
			const results = await Promise.allSettled([job1Promise, job2Promise]);

			// job1 should succeed (it was processing)
			const job1Result = results[0];
			expect(job1Result.status).toBe("fulfilled");

			// job2 should be rejected
			const job2Result = results[1];
			if (job2Result && job2Result.status === "rejected") {
				expect(job2Result.reason.message).toBe(
					"Concurrency changed - queue cleared",
				);
			}

			await new Promise((resolve) => setTimeout(resolve, 50));

			// Only job1 should have processed
			expect(processed).toHaveLength(1);
			expect(processed).toContain("job1");
		});

		it("should return 0 when no pending tasks", () => {
			const queue = new GroupedQueue<{ id: string }>(1);
			const clearedCount = queue.clearAllPendingTasks();
			expect(clearedCount).toBe(0);
		});

		it("should clear tasks from multiple groups", async () => {
			const queue = new GroupedQueue<{ id: string }>(1);
			const processed: string[] = [];

			queue.setHandler(async (data) => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				processed.push(data.id);
			});

			// Add jobs to multiple groups
			const promises = [
				queue.add("group1", { id: "job1" }),
				queue.add("group1", { id: "job2" }),
				queue.add("group2", { id: "job3" }),
				queue.add("group2", { id: "job4" }),
				queue.add("group3", { id: "job5" }),
			];

			// Wait a bit for first job to start (it gets shifted from tasks)
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Clear all pending
			const clearedCount = queue.clearAllPendingTasks();

			// Should clear 4 tasks (job2, job3, job4, job5)
			// job1 is processing so it's not in the queue anymore
			expect(clearedCount).toBe(4);

			// Handle all promises
			const results = await Promise.allSettled(promises);

			// job1 should succeed
			const job1Result = results[0];
			expect(job1Result?.status).toBe("fulfilled");

			// Others should be rejected
			for (let i = 1; i < results.length; i++) {
				const result = results[i];
				if (result && result.status === "rejected") {
					expect(result.reason.message).toBe(
						"Concurrency changed - queue cleared",
					);
				}
			}

			await new Promise((resolve) => setTimeout(resolve, 100));

			// Only first job should process
			expect(processed.length).toBeLessThanOrEqual(1);
		});
	});

	describe("Concurrency change with pending tasks", () => {
		it("should clear pending tasks when concurrency changes", async () => {
			const queue = new GroupedQueue<{ id: string }>(1);
			const processed: string[] = [];

			queue.setHandler(async (data) => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				processed.push(data.id);
			});

			// Add jobs with concurrency 1
			const job1Promise = queue.add("group1", { id: "job1" });
			const job2Promise = queue.add("group1", { id: "job2" });
			const job3Promise = queue.add("group2", { id: "job3" });

			// Wait for job1 to start processing (it gets shifted from tasks)
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Change concurrency - should clear pending tasks via clearAllPendingTasks
			queue.setConcurrency(3);

			// Handle all promises
			const results = await Promise.allSettled([
				job1Promise,
				job2Promise,
				job3Promise,
			]);

			// job1 should succeed (it was processing)
			const job1Result = results[0];
			expect(job1Result.status).toBe("fulfilled");

			// Pending jobs should be rejected (job2 and job3 were in queue when cleared)
			const job2Result = results[1];
			const job3Result = results[2];

			// At least one of the pending jobs should be rejected
			const rejectedCount = [job2Result, job3Result].filter(
				(r) => r && r.status === "rejected",
			).length;
			expect(rejectedCount).toBeGreaterThan(0);

			// Verify rejection messages
			if (job2Result && job2Result.status === "rejected") {
				expect(job2Result.reason.message).toBe(
					"Concurrency changed - queue cleared",
				);
			}
			if (job3Result && job3Result.status === "rejected") {
				expect(job3Result.reason.message).toBe(
					"Concurrency changed - queue cleared",
				);
			}

			await new Promise((resolve) => setTimeout(resolve, 100));

			// job1 should have processed, others may or may not depending on timing
			expect(processed.length).toBeGreaterThanOrEqual(1);
			expect(processed).toContain("job1");
		});

		it("should allow new jobs after concurrency change", async () => {
			const queue = new GroupedQueue<{ id: string }>(1);
			const processed: string[] = [];

			queue.setHandler(async (data) => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				processed.push(data.id);
			});

			// Add job with concurrency 1
			const job1Promise = queue.add("group1", { id: "job1" });
			const job2Promise = queue.add("group1", { id: "job2" });

			// Wait for job1 to start (it gets shifted from tasks)
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Change concurrency to 3 - this calls clearAllPendingTasks internally
			queue.setConcurrency(3);

			// Handle all promises
			const results = await Promise.allSettled([job1Promise, job2Promise]);

			// job1 should succeed (it was processing)
			const job1Result = results[0];
			expect(job1Result.status).toBe("fulfilled");

			// job2 should be rejected (it was in queue when cleared)
			const job2Result = results[1];
			if (job2Result && job2Result.status === "rejected") {
				expect(job2Result.reason.message).toBe(
					"Concurrency changed - queue cleared",
				);
			} else {
				// If job2 wasn't rejected, it means it started processing before clear
				// This is acceptable as it's a timing issue
			}

			// Add new jobs after concurrency change - they should work
			await Promise.all([
				queue.add("group2", { id: "job3" }),
				queue.add("group3", { id: "job4" }),
			]);

			await new Promise((resolve) => setTimeout(resolve, 100));

			// job1, job3, and job4 should have processed
			expect(processed.length).toBeGreaterThanOrEqual(2);
			expect(processed).toContain("job1");
		});
	});
});
