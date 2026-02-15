import {
	IS_CLOUD,
	findServerById,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";

interface ValidateTransferTargetServerInput {
	targetServerId: string | null | undefined;
	sourceServerId: string | null | undefined;
	organizationId: string;
}

interface TransferExecutionResult {
	success: boolean;
	errors: string[];
}

interface RunTransferWithDowntimeInput {
	stopSource: () => Promise<void>;
	startSource: () => Promise<void>;
	executeTransfer: () => Promise<TransferExecutionResult>;
	commitTransfer: () => Promise<void>;
}

interface RunTransferWithDowntimeResult {
	success: boolean;
	errors: string[];
	sourceRestarted: boolean;
}

const getErrorMessage = (
	error: unknown,
	fallback = "Unknown error",
): string => {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	return fallback;
};

export const validateTransferTargetServer = async ({
	targetServerId,
	sourceServerId,
	organizationId,
}: ValidateTransferTargetServerInput): Promise<string | null> => {
	const normalizeServerId = (
		serverId: string | null | undefined,
	): string | null => {
		if (!serverId) {
			return null;
		}
		const trimmedServerId = serverId.trim();
		return trimmedServerId.length > 0 ? trimmedServerId : null;
	};

	const normalizedSourceServerId = normalizeServerId(sourceServerId);
	const normalizedTargetServerId = normalizeServerId(targetServerId);

	if (IS_CLOUD && !normalizedTargetServerId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You need to select a target server for transfer",
		});
	}

	if (normalizedSourceServerId === normalizedTargetServerId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Source and target server must be different",
		});
	}

	if (normalizedTargetServerId) {
		const targetServer = await findServerById(normalizedTargetServerId);
		if (targetServer.organizationId !== organizationId) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You are not authorized to use the selected target server",
			});
		}
	}

	return normalizedTargetServerId;
};

export const stopSourceDockerService = async (
	sourceServerId: string | null,
	appName: string,
) => {
	const stopResult = sourceServerId
		? await stopServiceRemote(sourceServerId, appName)
		: await stopService(appName);

	if (stopResult instanceof Error) {
		throw stopResult;
	}

	if (stopResult) {
		throw new Error(
			typeof stopResult === "string"
				? stopResult
				: "Failed to stop source service",
		);
	}
};

export const startSourceDockerService = async (
	sourceServerId: string | null,
	appName: string,
) => {
	if (sourceServerId) {
		await startServiceRemote(sourceServerId, appName);
		return;
	}

	await startService(appName);
};

export const runTransferWithDowntime = async ({
	stopSource,
	startSource,
	executeTransfer,
	commitTransfer,
}: RunTransferWithDowntimeInput): Promise<RunTransferWithDowntimeResult> => {
	await stopSource();

	let transferResult: TransferExecutionResult;
	try {
		transferResult = await executeTransfer();
	} catch (error) {
		transferResult = {
			success: false,
			errors: [getErrorMessage(error, "Transfer execution failed")],
		};
	}

	if (transferResult.success) {
		try {
			await commitTransfer();
			return { success: true, errors: [], sourceRestarted: false };
		} catch (error) {
			transferResult = {
				success: false,
				errors: [
					...transferResult.errors,
					`Failed to finalize transfer: ${getErrorMessage(error)}`,
				],
			};
		}
	}

	let sourceRestarted = false;
	try {
		await startSource();
		sourceRestarted = true;
	} catch (error) {
		transferResult.errors.push(
			`Failed to restart source service: ${getErrorMessage(error)}`,
		);
	}

	return {
		success: false,
		errors: transferResult.errors,
		sourceRestarted,
	};
};
