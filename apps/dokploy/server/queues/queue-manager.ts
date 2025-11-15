/**
 * Queue Manager - Manages multiple dynamic queues
 * Each queue can have its own concurrency configuration
 */

import { GroupedQueue } from "./grouped-queue-wrapper";

export class QueueManager {
	private queues: Map<string, GroupedQueue<any>> = new Map();

	/**
	 * Get or create a queue with the specified name and concurrency
	 * Note: If queue already exists, concurrency parameter is ignored
	 */
	getQueue<T>(name: string, concurrency = 1): GroupedQueue<T> {
		if (!this.queues.has(name)) {
			this.queues.set(name, new GroupedQueue<T>(concurrency));
		}
		return this.queues.get(name) as GroupedQueue<T>;
	}

	/**
	 * Set handler for a specific queue
	 */
	setHandler<T>(queueName: string, handler: (data: T) => Promise<void>): void {
		const queue = this.getQueue<T>(queueName);
		queue.setHandler(handler);
	}

	/**
	 * Add a job to a specific queue and group
	 * If concurrency is provided and queue doesn't exist, creates it with that concurrency
	 */
	async add<T>(
		queueName: string,
		groupId: string,
		data: T,
		concurrency?: number,
	): Promise<void> {
		// If concurrency is provided and queue doesn't exist, create with that concurrency
		if (concurrency !== undefined && !this.queues.has(queueName)) {
			this.queues.set(queueName, new GroupedQueue<T>(concurrency));
		}
		const queue = this.getQueue<T>(queueName);
		return queue.add(groupId, data);
	}

	/**
	 * Clear all tasks for a specific group in a queue
	 */
	clearGroup(queueName: string, groupId: string): void {
		const queue = this.queues.get(queueName);
		if (queue) {
			queue.clearGroup(groupId);
		}
	}

	/**
	 * Get the number of pending tasks for a group in a queue
	 */
	getGroupLength(queueName: string, groupId: string): number {
		const queue = this.queues.get(queueName);
		return queue ? queue.getGroupLength(groupId) : 0;
	}

	/**
	 * Get total number of pending tasks across all groups in a queue
	 */
	getTotalLength(queueName: string): number {
		const queue = this.queues.get(queueName);
		return queue ? queue.getTotalLength() : 0;
	}

	/**
	 * Check if a queue is idle
	 */
	isIdle(queueName: string): boolean {
		const queue = this.queues.get(queueName);
		return queue ? queue.isIdle() : true;
	}

	/**
	 * Close a specific queue
	 */
	async closeQueue(queueName: string): Promise<void> {
		const queue = this.queues.get(queueName);
		if (queue) {
			await queue.close();
			this.queues.delete(queueName);
		}
	}

	/**
	 * Close all queues
	 */
	async closeAll(): Promise<void> {
		const promises = Array.from(this.queues.keys()).map((name) =>
			this.closeQueue(name),
		);
		await Promise.all(promises);
	}

	/**
	 * Get all queue names
	 */
	getQueueNames(): string[] {
		return Array.from(this.queues.keys());
	}
}

// Singleton instance
export const queueManager = new QueueManager();
