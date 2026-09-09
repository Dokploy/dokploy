declare global {
	interface Window {
		dataLayer?: Record<string, unknown>[];
		hsConversationsSettings?: {
			loadImmediately?: boolean;
		};
		hsConversationsOnReady?: (() => void)[];
		HubSpotConversations?: {
			widget: {
				load: () => void;
				remove: () => void;
			};
		};
	}
}

export const GTM_ID = "GTM-PWBFB2V2";

export const pushToDataLayer = (
	event: string,
	data: Record<string, unknown> = {},
) => {
	if (typeof window === "undefined") {
		return;
	}
	window.dataLayer = window.dataLayer || [];
	window.dataLayer.push({ event, ...data });
};
