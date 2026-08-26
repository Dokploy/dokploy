import {
	deleteServiceMigration,
	markServiceMigrationFailed,
} from "@dokploy/server/services/service-migration-store";

const describeError = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * Builds the combined error message surfaced to the caller when a move
 * fails and is rolled back, folding in every target-cleanup failure and (if
 * it happened) the source-restart failure - so a caller is never told only
 * "the move failed" while silently hiding that the source itself failed to
 * come back up, or that the target wasn't fully cleaned up.
 */
export const buildRollbackFailureMessage = ({
	originalError,
	cleanupErrors,
	restartError,
}: {
	originalError: unknown;
	cleanupErrors: unknown[];
	restartError: unknown | null;
}): string => {
	const extra: string[] = [];
	if (cleanupErrors.length > 0) {
		extra.push(
			`${cleanupErrors.length} target cleanup step(s) failed - see server logs`,
		);
	}
	if (restartError) {
		extra.push(
			`restarting the source service failed: ${describeError(restartError)}`,
		);
	}
	const base = describeError(originalError);
	return extra.length > 0
		? `${base} (additionally, ${extra.join("; ")})`
		: base;
};

/**
 * Resolves the durable service_migration row once a move's rollback has
 * been attempted (target cleanup + source restart), and returns the error
 * to throw to the caller.
 *
 * The row is only ever deleted - releasing the per-service "pending" lock
 * entirely - when the rollback FULLY succeeded (no cleanup errors and the
 * source restart, if attempted, succeeded). Otherwise it is retained with
 * status `failed` and a description of what needs manual attention, so a
 * partially-rolled-back move is never silently lost.
 */
export const resolveServiceMigrationAfterRollback = async ({
	serviceMigrationId,
	originalError,
	cleanupErrors,
	restartError,
}: {
	serviceMigrationId: string;
	originalError: unknown;
	cleanupErrors: unknown[];
	restartError: unknown | null;
}): Promise<Error> => {
	const message = buildRollbackFailureMessage({
		originalError,
		cleanupErrors,
		restartError,
	});
	const rollbackFullySucceeded = cleanupErrors.length === 0 && !restartError;

	if (rollbackFullySucceeded) {
		await deleteServiceMigration(serviceMigrationId);
	} else {
		await markServiceMigrationFailed({ serviceMigrationId, error: message });
	}

	return new Error(message, { cause: originalError });
};
