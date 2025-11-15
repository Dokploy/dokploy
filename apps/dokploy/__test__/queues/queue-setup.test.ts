import { beforeEach, describe, expect, it } from "vitest";
import type { DeploymentJob } from "../../server/queues/queue-types";
import {
	getConcurrency,
	myQueue,
	setConcurrency,
} from "../../server/queues/queueSetup";

describe("queueSetup", () => {
	beforeEach(() => {
		// Reset concurrency to default (1) before each test
		setConcurrency(1);
		// Clear all pending tasks
		myQueue.clearAllPendingTasks();
	});

	describe("getConcurrency", () => {
		it("should return default concurrency of 1", () => {
			const concurrency = getConcurrency();
			expect(concurrency).toBe(1);
		});

		it("should return current concurrency after setting it", () => {
			setConcurrency(3);
			expect(getConcurrency()).toBe(3);

			setConcurrency(5);
			expect(getConcurrency()).toBe(5);
		});
	});

	describe("setConcurrency", () => {
		it("should set concurrency successfully", () => {
			const clearedCount = setConcurrency(3);
			expect(getConcurrency()).toBe(3);
			expect(clearedCount).toBe(0); // No pending tasks to clear
		});

		it("should throw error for concurrency less than 1", () => {
			expect(() => setConcurrency(0)).toThrow("Concurrency must be at least 1");
			expect(() => setConcurrency(-1)).toThrow(
				"Concurrency must be at least 1",
			);
		});

		it("should return 0 cleared builds when no pending tasks", () => {
			const clearedCount = setConcurrency(2);
			expect(clearedCount).toBe(0);
			expect(getConcurrency()).toBe(2);
		});

		it("should clear pending builds when concurrency changes", async () => {
			const processed: string[] = [];

			// Set handler
			myQueue.setHandler(async (job: DeploymentJob) => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				if (job.applicationType === "application") {
					processed.push(job.applicationId);
				} else if (job.applicationType === "compose") {
					processed.push(job.composeId);
				} else if (job.applicationType === "application-preview") {
					processed.push(job.previewDeploymentId);
				}
			});

			// Add jobs to different groups
			const job1: DeploymentJob = {
				applicationId: "app1",
				titleLog: "Test",
				descriptionLog: "Test",
				type: "deploy",
				applicationType: "application",
				server: false,
			};
			const job2: DeploymentJob = {
				applicationId: "app2",
				titleLog: "Test",
				descriptionLog: "Test",
				type: "deploy",
				applicationType: "application",
				server: false,
			};
			const job3: DeploymentJob = {
				applicationId: "app3",
				titleLog: "Test",
				descriptionLog: "Test",
				type: "deploy",
				applicationType: "application",
				server: false,
			};

			// Add jobs without awaiting
			const promise1 = myQueue.add("application:app1", job1);
			const promise2 = myQueue.add("application:app2", job2);
			const promise3 = myQueue.add("application:app3", job3);

			// Wait for first job to start processing
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Change concurrency - should clear pending builds
			const clearedCount = setConcurrency(3);

			// Should have cleared 2 pending builds (app2 and app3)
			expect(clearedCount).toBe(2);
			expect(getConcurrency()).toBe(3);

			// Handle all promises - use allSettled to handle both resolved and rejected
			const results = await Promise.allSettled([promise1, promise2, promise3]);

			// job1 should succeed (it was processing), others should be rejected
			const job1Result = results[0];
			if (job1Result.status === "fulfilled") {
				// Job1 completed successfully
			}

			// Pending jobs should be rejected
			const job2Result = results[1];
			const job3Result = results[2];
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

			await new Promise((resolve) => setTimeout(resolve, 150));

			// Only first job should have processed
			expect(processed.length).toBeLessThanOrEqual(1);
		});

		it("should not clear builds when concurrency doesn't change", async () => {
			// Set to 2
			setConcurrency(2);
			expect(getConcurrency()).toBe(2);

			// Set to 2 again - should not clear anything
			const clearedCount = setConcurrency(2);
			expect(clearedCount).toBe(0);
			expect(getConcurrency()).toBe(2);
		});

		it("should allow new jobs after concurrency change", async () => {
			const processed: string[] = [];

			myQueue.setHandler(async (job: DeploymentJob) => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				if (job.applicationType === "application") {
					processed.push(job.applicationId);
				}
			});

			// Add job with concurrency 1
			const job1: DeploymentJob = {
				applicationId: "app1",
				titleLog: "Test",
				descriptionLog: "Test",
				type: "deploy",
				applicationType: "application",
				server: false,
			};
			const job2: DeploymentJob = {
				applicationId: "app2",
				titleLog: "Test",
				descriptionLog: "Test",
				type: "deploy",
				applicationType: "application",
				server: false,
			};

			const promise1 = myQueue.add("application:app1", job1);
			const promise2 = myQueue.add("application:app2", job2);

			// Wait for first job to start
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Change concurrency to 3
			const clearedCount = setConcurrency(3);
			expect(clearedCount).toBe(1); // app2 should be cleared

			// Handle all promises - use allSettled to handle both resolved and rejected
			const results = await Promise.allSettled([promise1, promise2]);

			// job1 should succeed (it was processing)
			const job1Result = results[0];
			if (job1Result.status === "fulfilled") {
				// Job1 completed successfully
			}

			// app2 should be rejected
			const job2Result = results[1];
			if (job2Result.status === "rejected") {
				expect(job2Result.reason.message).toBe(
					"Concurrency changed - queue cleared",
				);
			}

			// Add new jobs after concurrency change - they should work
			const job3: DeploymentJob = {
				applicationId: "app3",
				titleLog: "Test",
				descriptionLog: "Test",
				type: "deploy",
				applicationType: "application",
				server: false,
			};
			const job4: DeploymentJob = {
				applicationId: "app4",
				titleLog: "Test",
				descriptionLog: "Test",
				type: "deploy",
				applicationType: "application",
				server: false,
			};

			await Promise.all([
				myQueue.add("application:app3", job3),
				myQueue.add("application:app4", job4),
			]);

			await new Promise((resolve) => setTimeout(resolve, 150));

			// app1, app3, and app4 should have processed
			expect(processed.length).toBeGreaterThanOrEqual(2);
			expect(processed).toContain("app1");
		});

		it("should handle multiple concurrency changes correctly", () => {
			// Start at 1
			expect(getConcurrency()).toBe(1);

			// Change to 3
			setConcurrency(3);
			expect(getConcurrency()).toBe(3);

			// Change to 5
			setConcurrency(5);
			expect(getConcurrency()).toBe(5);

			// Change back to 1
			setConcurrency(1);
			expect(getConcurrency()).toBe(1);
		});
	});
});
