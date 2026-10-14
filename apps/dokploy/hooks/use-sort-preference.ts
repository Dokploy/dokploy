import { useEffect, useState } from "react";

// Initializes from defaultValue (not localStorage) to avoid an SSR/client hydration mismatch, then syncs from localStorage after mount.
export const useSortPreference = <T extends string>(
	key: string,
	defaultValue: T,
	allowedValues: readonly T[],
) => {
	const [value, setValue] = useState<T>(defaultValue);

	useEffect(() => {
		const stored = localStorage.getItem(key);
		if (stored && (allowedValues as readonly string[]).includes(stored)) {
			setValue(stored as T);
		}
	}, [key]);

	const setPreference = (next: T) => {
		setValue(next);
		localStorage.setItem(key, next);
	};

	return [value, setPreference] as const;
};
