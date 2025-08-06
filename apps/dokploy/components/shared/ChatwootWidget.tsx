import Script from "next/script";
import { useEffect } from "react";

interface ChatwootWidgetProps {
	websiteToken: string;
	baseUrl?: string;
	settings?: {
		position?: "left" | "right";
		type?: "standard" | "expanded_bubble";
		launcherTitle?: string;
		darkMode?: boolean;
		hideMessageBubble?: boolean;
		placement?: "left" | "right";
		showPopoutButton?: boolean;
		widgetStyle?: "standard" | "bubble";
	};
	user?: {
		identifier: string;
		name?: string;
		email?: string;
		phoneNumber?: string;
		avatarUrl?: string;
		customAttributes?: Record<string, any>;
		identifierHash?: string;
	};
}

export const ChatwootWidget = ({
	websiteToken,
	baseUrl = "https://app.chatwoot.com",
	settings = {
		position: "right",
		type: "standard",
		launcherTitle: "Chat with us",
	},
	user,
}: ChatwootWidgetProps) => {
	useEffect(() => {
		// Configurar los settings de Chatwoot
		window.chatwootSettings = {
			position: "right",
		};

		window.chatwootSDKReady = () => {
			window.chatwootSDK?.run({ websiteToken, baseUrl });

			const trySetUser = () => {
				if (window.$chatwoot && user) {
					window.$chatwoot.setUser(user.identifier, {
						email: user.email,
						name: user.name,
						avatar_url: user.avatarUrl,
						phone_number: user.phoneNumber,
					});
				}
			};

			trySetUser();
		};
	}, [websiteToken, baseUrl, user, settings]);

	return (
		<Script
			src={`${baseUrl}/packs/js/sdk.js`}
			strategy="lazyOnload"
			onLoad={() => window.chatwootSDKReady?.()}
		/>
	);
};
