export const stopComposeBeforeTransfer = async (
	stop: (composeId: string) => Promise<unknown>,
	composeId: string,
	log: (line: string) => void,
) => {
	try {
		await stop(composeId);
	} catch (error) {
		log(
			`  Could not stop compose: ${error instanceof Error ? error.message : String(error)}`,
		);
		throw error;
	}
};
