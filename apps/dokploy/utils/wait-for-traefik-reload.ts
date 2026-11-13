interface ReloadStatus {
	state: string | null;
	isReloading: boolean;
	lastReloadError: string | null;
}

export const waitForTraefikReload = async (
	getStatus: () => Promise<ReloadStatus>,
) => {
	const deadline = Date.now() + 90_000;
	while (Date.now() < deadline) {
		// The panel may be unreachable while its own proxy is restarting.
		const status = await getStatus().catch(() => null);
		if (status && !status.isReloading) {
			if (status.lastReloadError) throw new Error(status.lastReloadError);
			if (status.state === "running") return;
		}
		await new Promise((resolve) => setTimeout(resolve, 3000));
	}
	throw new Error("Traefik has not recovered yet. Check View Logs for errors.");
};
