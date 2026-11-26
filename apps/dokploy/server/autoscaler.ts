import http from "node:http";
import { runAutoscaler } from "@dokploy/server";
import packageInfo from "../package.json";

const HEALTH_PORT = Number(process.env.AUTOSCALER_HEALTH_PORT || 3100);
// One loop takes seconds; one that has not come round in this long is stuck,
// and the container health check makes Swarm replace it.
const STALE_MS = 120_000;

let aliveAt = Date.now();
const stop = new AbortController();

const health = http.createServer((_request, response) => {
	const healthy = Date.now() - aliveAt < STALE_MS;
	response.writeHead(healthy ? 200 : 503, {
		"content-type": "application/json",
	});
	response.end(
		JSON.stringify({
			status: healthy ? "ok" : "stalled",
			aliveAt: new Date(aliveAt).toISOString(),
		}),
	);
});
health.listen(HEALTH_PORT, "127.0.0.1");

for (const signal of ["SIGTERM", "SIGINT"] as const) {
	process.on(signal, () => stop.abort());
}

console.log(`Dokploy autoscaler ${packageInfo.version} starting`);
void runAutoscaler({
	version: packageInfo.version,
	signal: stop.signal,
	onAlive: () => {
		aliveAt = Date.now();
	},
})
	.catch((error) => {
		console.error("Autoscaler stopped", error);
		process.exitCode = 1;
	})
	.finally(() => {
		health.close();
		process.exit();
	});
