import { getWebServerSettings, updateWebServerSettings } from "../services/web-server-settings";
import { setupWebMonitoring } from "./monitoring-setup";

const generateToken = () => {
	const array = new Uint8Array(64);
	crypto.getRandomValues(array);
	return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const initializeMonitoring = async () => {
	try {
		const webServerSettings = await getWebServerSettings();

		// Check if monitoring is already configured
		if (!webServerSettings?.metricsConfig?.server?.token ||
			!webServerSettings?.metricsConfig?.server?.urlCallback) {

			console.log("🔄 Initializing monitoring with default configuration...");

			const token = generateToken();
			const urlCallback = process.env.MONITORING_CALLBACK_URL ||
				`http://localhost:3000/api/trpc/notification.receiveNotification`;

			// Update with default monitoring configuration
			await updateWebServerSettings({
				metricsConfig: {
					server: {
						type: "Dokploy",
						refreshRate: webServerSettings?.metricsConfig?.server?.refreshRate || 60,
						port: webServerSettings?.metricsConfig?.server?.port || 4500,
						token: token,
						urlCallback: urlCallback,
						retentionDays: webServerSettings?.metricsConfig?.server?.retentionDays || 7,
						cronJob: webServerSettings?.metricsConfig?.server?.cronJob || "0 0 * * *",
						thresholds: {
							cpu: webServerSettings?.metricsConfig?.server?.thresholds?.cpu || 80,
							memory: webServerSettings?.metricsConfig?.server?.thresholds?.memory || 80,
						},
					},
					containers: {
						refreshRate: webServerSettings?.metricsConfig?.containers?.refreshRate || 60,
						services: {
							include: webServerSettings?.metricsConfig?.containers?.services?.include || [],
							exclude: webServerSettings?.metricsConfig?.containers?.services?.exclude || [],
						},
					},
				},
			});

			console.log("✅ Monitoring configuration initialized");
		}

		// Start monitoring container
		console.log("🔄 Starting monitoring container...");
		await setupWebMonitoring();
		console.log("✅ Monitoring container started successfully");

	} catch (error) {
		console.error("⚠️ Failed to initialize monitoring (non-critical):", error instanceof Error ? error.message : error);
		// Don't throw - monitoring is optional and shouldn't prevent server startup
	}
};

