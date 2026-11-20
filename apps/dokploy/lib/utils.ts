import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export async function generateSHA256Hash(text: string) {
	const encoder = new TextEncoder();
	const data = encoder.encode(text);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function formatTimestamp(timestamp: string | number | undefined) {
	try {
		// Si es un string ISO, lo parseamos directamente
		if (typeof timestamp === "string" && timestamp.includes("T")) {
			const date = new Date(timestamp);
			if (!Number.isNaN(date.getTime())) {
				return date.toLocaleString();
			}
		}
		return "Fecha inválida";
	} catch {
		return "Fecha inválida";
	}
}

export function getFallbackAvatarInitials(
	fullName: string | undefined,
): string {
	if (typeof fullName === "undefined" || fullName === "") return "CN";
	const [name = "", surname = ""] = fullName.split(" ");
	if (surname === "") {
		return name.substring(0, 2).toUpperCase();
	}
	return (name.charAt(0) + surname.charAt(0)).toUpperCase();
}

/** "1 service", "2 services". */
export function pluralize(count: number, noun: string) {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** True when any of the values contains the search text (case-insensitive); an empty search matches everything. */
export function matchesSearch(
	search: string,
	...values: (string | null | undefined)[]
) {
	const term = search.trim().toLowerCase();
	return (
		term === "" || values.some((value) => value?.toLowerCase().includes(term))
	);
}
