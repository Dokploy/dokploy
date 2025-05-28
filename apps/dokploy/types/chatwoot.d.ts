declare global {
	interface Window {
		chatwootSettings?: {
			position?: "left" | "right";
			type?: "standard" | "expanded_bubble";
			launcherTitle?: string;
			darkMode?: boolean;
			hideMessageBubble?: boolean;
			placement?: "right" | "left";
			showPopoutButton?: boolean;
			widgetStyle?: "standard" | "bubble";
		};
		chatwootSDK?: {
			run: (config: {
				websiteToken: string;
				baseUrl: string;
				user?: {
					identifier?: string;
					name?: string;
					email?: string;
					phone?: string;
					avatar_url?: string;
					custom_attributes?: Record<string, any>;
				};
			}) => void;
		};
		$chatwoot?: {
			setUser: (
				identifier: string,
				userAttributes: Record<string, any>,
			) => void;
			reset: () => void;
			toggle: () => void;
		};
		chatwootSDKReady?: () => void;
	}
}

export {};
