import { useCallback, useState } from "react";
import { toast } from "sonner";

const HEALTH_CHECK_URL = "/api/health";

export interface UseHealthCheckAfterMutationOptions {
	/**
	 * Delay in ms before starting to poll the health endpoint.
	 * Gives time for the service (e.g. Traefik) to restart.
	 * @default 5000
	 */
	initialDelay?: number;
	/**
	 * Delay in ms between each health check poll.
	 * @default 2000
	 */
	pollInterval?: number;
	/**
	 * Message shown in toast when the operation completes successfully.
	 */
	successMessage: string;
	/**
	 * Callback when health check passes. Use for refetching data.
	 */
	onSuccess?: () => void | Promise<void>;
	/**
	 * If true, reloads the page when health check passes (e.g. for server update).
	 * @default false
	 */
	reloadOnSuccess?: boolean;
}

export const useHealthCheckAfterMutation = ({
	initialDelay = 5000,
	pollInterval = 2000,
	successMessage,
	onSuccess,
	reloadOnSuccess = false,
}: UseHealthCheckAfterMutationOptions) => {
	const [isExecuting, setIsExecuting] = useState(false);

	const checkHealth = useCallback(async (): Promise<boolean> => {
		try {
			const response = await fetch(HEALTH_CHECK_URL);
			return response.ok;
		} catch {
			return false;
		}
	}, []);

	const pollUntilHealthy = useCallback(async (): Promise<void> => {
		const isHealthy = await checkHealth();

		if (isHealthy) {
			toast.success(successMessage);

			if (reloadOnSuccess) {
				setTimeout(() => {
					window.location.reload();
				}, 2000);
			} else {
				await onSuccess?.();
			}
			return;
		}

		await new Promise((resolve) => setTimeout(resolve, pollInterval));
		await pollUntilHealthy();
	}, [checkHealth, successMessage, reloadOnSuccess, onSuccess, pollInterval]);

	const execute = useCallback(
		async <T>(mutationFn: () => Promise<T>): Promise<T> => {
			setIsExecuting(true);

			try {
				const result = await mutationFn();

				// Give time for the service to restart before polling
				await new Promise((resolve) => setTimeout(resolve, initialDelay));

				await pollUntilHealthy();

				return result;
			} finally {
				setIsExecuting(false);
			}
		},
		[initialDelay, pollUntilHealthy],
	);

	return { execute, isExecuting };
};
