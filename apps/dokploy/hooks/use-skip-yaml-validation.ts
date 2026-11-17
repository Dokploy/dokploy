import { useEffect, useState } from "react";

// Starts false to avoid an SSR/client hydration mismatch, then syncs from localStorage after mount.
export const useSkipYamlValidation = (path: string, serverId?: string) => {
	const key = `traefik-skip-yaml-validation:${serverId ?? "local"}:${path}`;
	const [skipYamlValidation, setSkipYamlValidation] = useState(false);

	useEffect(() => {
		try {
			setSkipYamlValidation(localStorage.getItem(key) === "true");
		} catch {
			setSkipYamlValidation(false);
		}
	}, [key]);

	const setSkip = (next: boolean) => {
		setSkipYamlValidation(next);
		try {
			if (next) {
				localStorage.setItem(key, "true");
			} else {
				localStorage.removeItem(key);
			}
		} catch {
			// Storage can be blocked or full; the in-memory value still applies for this session.
		}
	};

	return [skipYamlValidation, setSkip] as const;
};
