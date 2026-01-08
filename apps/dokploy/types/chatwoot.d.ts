declare global {
	interface Window {
		chatwootSettings?: {
			hideMessageBubble?: boolean;
			showUnreadMessagesDialog?: boolean;
			position?: "left" | "right";
			locale?: string;
			useBrowserLanguage?: boolean;
			type?: "standard" | "expanded_bubble";
			darkMode?: "light" | "auto";
			launcherTitle?: string;
			showPopoutButton?: boolean;
			baseDomain?: string;
		};
		chatwootSDK?: {
			run: (config: { websiteToken: string; baseUrl: string }) => void;
		};
		$chatwoot?: {
			setUser: (
				identifier: string,
				userAttributes: Record<string, any>,
			) => void;
			setCustomAttributes: (attributes: Record<string, any>) => void;
			reset: () => void;
			toggle: (state?: "open" | "close") => void;
			popoutChatWindow: () => void;
			toggleBubbleVisibility: (visibility: "show" | "hide") => void;
			setLocale: (locale: string) => void;
			setLabel: (label: string) => void;
			removeLabel: (label: string) => void;
		};
		chatwootSDKReady?: () => void;
	}
}

export {};
