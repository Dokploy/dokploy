import posthog from "posthog-js";

// posthog-js is only initialised on Dokploy Cloud, so this is a no-op elsewhere.
export const trackOnboarding = (
	event: string,
	properties?: Record<string, string>,
) => {
	if (posthog.__loaded) {
		posthog.capture(event, properties);
	}
};
