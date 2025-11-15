/**
 * In-memory grouped queue implementation
 * Each group processes one job at a time (FIFO per group)
 * Multiple groups can process in parallel
 */

type Task<T> = {
	data: T;
	resolve: () => void;
	reject: (error: Error) => void;
};

type GroupQueue<T> = {
	tasks: Task<T>[];
	processing: boolean;
};

export class GroupedQueue<T> {
	private groups: Map<string, GroupQueue<T>> = new Map();
	private handler?: (data: T) => Promise<void>;
	private concurrency: number;
	private activeGroups: Set<string> = new Set();

	constructor(concurrency = 4) {
		this.concurrency = concurrency;
	}

	/**
	 * Set the handler function that processes each job
	 */
	setHandler(handler: (data: T) => Promise<void>) {
		this.handler = handler;
	}

	/**
	 * Add a job to a group queue
	 */
	async add(groupId: string, data: T): Promise<void> {
		if (process.env.NODE_ENV !== "test") {
			console.log(
				`Adding job to group ${groupId}, handler set: ${!!this.handler}`,
			);
		}
		return new Promise((resolve, reject) => {
			if (!this.groups.has(groupId)) {
				this.groups.set(groupId, {
					tasks: [],
					processing: false,
				});
			}

			const group = this.groups.get(groupId)!;
			group.tasks.push({
				data,
				resolve,
				reject,
			});

			// Start processing if not already processing and under concurrency limit
			if (!group.processing && this.activeGroups.size < this.concurrency) {
				this.processGroup(groupId);
			}
		});
	}

	/**
	 * Process jobs in a group queue
	 */
	private async processGroup(groupId: string): Promise<void> {
		const group = this.groups.get(groupId);
		if (!group || group.processing) {
			return;
		}

		// Wait for handler to be set if not available
		if (!this.handler) {
			if (process.env.NODE_ENV !== "test") {
				console.log(`Handler not set yet for group ${groupId}, waiting...`);
			}
			// Retry after a short delay
			setTimeout(() => {
				if (this.handler && group.tasks.length > 0) {
					this.processGroup(groupId);
				}
			}, 100);
			return;
		}

		// Check concurrency limit
		if (this.activeGroups.size >= this.concurrency) {
			return;
		}

		group.processing = true;
		this.activeGroups.add(groupId);
		if (process.env.NODE_ENV !== "test") {
			console.log(`Processing group ${groupId}, tasks: ${group.tasks.length}`);
		}

		while (group.tasks.length > 0) {
			const task = group.tasks.shift()!;

			try {
				if (process.env.NODE_ENV !== "test") {
					console.log(`Executing handler for group ${groupId}`);
				}
				await this.handler!(task.data);
				task.resolve();
				if (process.env.NODE_ENV !== "test") {
					console.log(`Handler completed for group ${groupId}`);
				}
			} catch (error) {
				if (process.env.NODE_ENV !== "test") {
					console.error(`Handler error for group ${groupId}:`, error);
				}
				task.reject(error instanceof Error ? error : new Error(String(error)));
			}
		}

		group.processing = false;
		this.activeGroups.delete(groupId);

		// Try to process another group if there are waiting groups
		this.processNextGroup();
	}

	/**
	 * Process the next available group
	 */
	private processNextGroup(): void {
		if (this.activeGroups.size >= this.concurrency) {
			return;
		}

		// Find a group with pending tasks that's not currently processing
		for (const [groupId, group] of this.groups.entries()) {
			if (
				!group.processing &&
				group.tasks.length > 0 &&
				!this.activeGroups.has(groupId)
			) {
				this.processGroup(groupId);
				break;
			}
		}
	}

	/**
	 * Remove all tasks for a specific group
	 */
	clearGroup(groupId: string): void {
		const group = this.groups.get(groupId);
		if (group) {
			// Reject all pending tasks
			for (const task of group.tasks) {
				task.reject(new Error("Queue cleared"));
			}
			group.tasks = [];
		}
	}

	/**
	 * Clear all pending tasks across all groups
	 * This is useful when changing concurrency settings
	 * Note: This only clears tasks in the queue, not the currently executing task
	 */
	clearAllPendingTasks(): number {
		let clearedCount = 0;
		for (const [groupId, group] of this.groups.entries()) {
			// Clear all pending tasks in the queue
			// The currently executing task is not in group.tasks (it was already shifted)
			if (group.tasks.length > 0) {
				clearedCount += group.tasks.length;
				for (const task of group.tasks) {
					task.reject(new Error("Concurrency changed - queue cleared"));
				}
				group.tasks = [];
			}
		}
		return clearedCount;
	}

	/**
	 * Get the number of pending tasks for a group
	 */
	getGroupLength(groupId: string): number {
		return this.groups.get(groupId)?.tasks.length ?? 0;
	}

	/**
	 * Get total number of pending tasks across all groups
	 */
	getTotalLength(): number {
		let total = 0;
		for (const group of this.groups.values()) {
			total += group.tasks.length;
		}
		return total;
	}

	/**
	 * Check if queue is idle (no active processing)
	 */
	isIdle(): boolean {
		return this.activeGroups.size === 0;
	}

	/**
	 * Get the number of active groups (for testing)
	 */
	getActiveGroupsCount(): number {
		return this.activeGroups.size;
	}

	/**
	 * Get the concurrency limit
	 */
	getConcurrency(): number {
		return this.concurrency;
	}

	/**
	 * Set the concurrency limit dynamically
	 * This allows changing concurrency without recreating the queue
	 * WARNING: This will clear all pending tasks when concurrency changes
	 */
	setConcurrency(concurrency: number): void {
		if (concurrency < 1) {
			throw new Error("Concurrency must be at least 1");
		}
		const concurrencyChanged = this.concurrency !== concurrency;
		this.concurrency = concurrency;

		// If concurrency changed, clear all pending tasks
		if (concurrencyChanged) {
			this.clearAllPendingTasks();
		}

		// Process next group if we now have capacity
		this.processNextGroup();
	}

	/**
	 * Close the queue and reject all pending tasks
	 */
	async close(): Promise<void> {
		for (const [groupId, group] of this.groups.entries()) {
			for (const task of group.tasks) {
				task.reject(new Error("Queue closed"));
			}
			group.tasks = [];
		}
		this.groups.clear();
		this.activeGroups.clear();
	}
}
