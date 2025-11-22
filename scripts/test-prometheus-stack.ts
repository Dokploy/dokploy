#!/usr/bin/env tsx

/**
 * Manual test script for Prometheus monitoring stack
 * This script can be used to manually test the Prometheus integration locally
 *
 * Usage:
 *   pnpm tsx scripts/test-prometheus-stack.ts setup
 *   pnpm tsx scripts/test-prometheus-stack.ts check
 *   pnpm tsx scripts/test-prometheus-stack.ts stop
 */

import {
	checkPrometheusHealth,
	getSystemMetrics,
} from "../packages/server/src/monitoring/prometheus-utils";
import {
	setupPrometheusStack,
	stopPrometheusStack,
} from "../packages/server/src/setup/prometheus-setup";

const command = process.argv[2];

async function setup() {
	console.log("Setting up Prometheus monitoring stack...");
	try {
		await setupPrometheusStack();
		console.log("✅ Prometheus monitoring stack setup complete!");
		console.log("\nYou can access:");
		console.log("  - Prometheus UI: http://localhost:9090");
		console.log("  - Node Exporter metrics: http://localhost:9100/metrics");
		console.log("  - cAdvisor UI: http://localhost:8080");
		console.log("\nWait a few seconds for containers to start, then run:");
		console.log("  pnpm tsx scripts/test-prometheus-stack.ts check");
	} catch (error) {
		console.error("❌ Failed to setup Prometheus stack:", error);
		process.exit(1);
	}
}

async function check() {
	console.log("Checking Prometheus health...");
	try {
		const isHealthy = await checkPrometheusHealth();
		if (isHealthy) {
			console.log("✅ Prometheus is healthy!");

			console.log("\nFetching system metrics...");
			// Wait a bit for metrics to be collected
			await new Promise((resolve) => setTimeout(resolve, 5000));

			const metrics = await getSystemMetrics();
			console.log("\n📊 System Metrics:");
			console.log(JSON.stringify(metrics, null, 2));
		} else {
			console.log("❌ Prometheus is not healthy. Make sure it's running:");
			console.log("  docker ps | grep prometheus");
		}
	} catch (error) {
		console.error("❌ Failed to check Prometheus health:", error);
		console.log("\nMake sure Prometheus is running:");
		console.log("  docker ps | grep prometheus");
		process.exit(1);
	}
}

async function stop() {
	console.log("Stopping Prometheus monitoring stack...");
	try {
		await stopPrometheusStack();
		console.log("✅ Prometheus monitoring stack stopped!");
	} catch (error) {
		console.error("❌ Failed to stop Prometheus stack:", error);
		process.exit(1);
	}
}

async function main() {
	if (!command) {
		console.log("Usage: pnpm tsx scripts/test-prometheus-stack.ts <command>");
		console.log("\nCommands:");
		console.log("  setup  - Setup Prometheus monitoring stack");
		console.log("  check  - Check Prometheus health and fetch metrics");
		console.log("  stop   - Stop Prometheus monitoring stack");
		process.exit(1);
	}

	switch (command) {
		case "setup":
			await setup();
			break;
		case "check":
			await check();
			break;
		case "stop":
			await stop();
			break;
		default:
			console.log(`Unknown command: ${command}`);
			console.log("Valid commands: setup, check, stop");
			process.exit(1);
	}
}

main().catch((error) => {
	console.error("Error:", error);
	process.exit(1);
});
