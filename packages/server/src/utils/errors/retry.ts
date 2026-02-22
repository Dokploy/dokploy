import { sleep } from "../process/execAsync";
import type { StructuredError } from "./structured-errors";

export interface RetryOptions {
	maxRetries?: number;
	initialDelay?: number;
	maxDelay?: number;
	backoffMultiplier?: number;
	onRetry?: (attempt: number, error: Error) => void;
	retryCondition?: (error: Error) => boolean;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "onRetry" | "retryCondition">> = {
	maxRetries: 3,
	initialDelay: 1000,
	maxDelay: 30000,
	backoffMultiplier: 2,
};

/**
 * Calculate delay for retry with exponential backoff
 */
const calculateDelay = (
	attempt: number,
	initialDelay: number,
	maxDelay: number,
	backoffMultiplier: number,
): number => {
	const delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
	return Math.min(delay, maxDelay);
};

/**
 * Retry a function with exponential backoff
 */
export const retryWithBackoff = async <T>(
	fn: () => Promise<T>,
	options: RetryOptions = {},
): Promise<T> => {
	const {
		maxRetries = DEFAULT_OPTIONS.maxRetries,
		initialDelay = DEFAULT_OPTIONS.initialDelay,
		maxDelay = DEFAULT_OPTIONS.maxDelay,
		backoffMultiplier = DEFAULT_OPTIONS.backoffMultiplier,
		onRetry,
		retryCondition,
	} = options;

	let lastError: Error | undefined;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Check if error should be retried
			if (retryCondition && !retryCondition(lastError)) {
				throw lastError;
			}

			// Check if this is a StructuredError and if it can be retried
			if (lastError instanceof StructuredError) {
				if (!lastError.canRetry(attempt)) {
					throw lastError;
				}
			}

			// Don't retry on last attempt
			if (attempt === maxRetries) {
				throw lastError;
			}

			// Calculate delay and wait
			const delay = calculateDelay(
				attempt,
				initialDelay,
				maxDelay,
				backoffMultiplier,
			);

			if (onRetry) {
				onRetry(attempt, lastError);
			}

			await sleep(delay);
		}
	}

	// This should never be reached, but TypeScript needs it
	throw lastError || new Error("Retry failed");
};

/**
 * Retry condition for network errors
 */
export const isNetworkError = (error: Error): boolean => {
	const message = error.message.toLowerCase();
	return (
		message.includes("network") ||
		message.includes("timeout") ||
		message.includes("connection") ||
		message.includes("econnrefused") ||
		message.includes("enotfound") ||
		message.includes("econnreset")
	);
};

/**
 * Retry condition for mount errors
 */
export const isMountError = (error: Error): boolean => {
	return (
		error.message.toLowerCase().includes("mount") ||
		error.message.toLowerCase().includes("nfs") ||
		error.message.toLowerCase().includes("smb") ||
		error.message.toLowerCase().includes("cifs")
	);
};

/**
 * Retry condition for temporary errors
 */
export const isTemporaryError = (error: Error): boolean => {
	const message = error.message.toLowerCase();
	return (
		isNetworkError(error) ||
		message.includes("temporary") ||
		message.includes("retry") ||
		message.includes("busy") ||
		message.includes("resource temporarily unavailable")
	);
};

