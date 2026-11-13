import { recoverTraefik } from "@dokploy/server";

export const startTraefikRecovery = () => {
	let running = false;
	const check = async () => {
		if (running) return;
		running = true;
		try {
			await recoverTraefik();
		} catch (error) {
			console.error("Failed to recover Traefik:", error);
		} finally {
			running = false;
		}
	};
	void check();
	const timer = setInterval(() => void check(), 60_000);
	timer.unref();
	return () => clearInterval(timer);
};
