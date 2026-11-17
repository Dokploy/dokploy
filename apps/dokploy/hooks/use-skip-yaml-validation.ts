import { useEffect, useState } from "react";

// Starts false to avoid an SSR/client hydration mismatch, then syncs from localStorage after mount.
export const useSkipYamlValidation = (path: string, serverId?: string) => {
	const key = `traefik-skip-yaml-validation:${serverId ?? "local"}:${path}`;
	const [skipYamlValidation, setSkipYamlValidation] = useState(false);

	useEffect(() => {
		setSkipYamlValidation(localStorage.getItem(key) === "true");
	}, [key]);

	const setSkip = (next: boolean) => {
		setSkipYamlValidation(next);
		if (next) {
			localStorage.setItem(key, "true");
		} else {
			localStorage.removeItem(key);
		}
	};

	return [skipYamlValidation, setSkip] as const;
};
