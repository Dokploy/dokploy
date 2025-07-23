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

export function formatTimestamp(timestamp: string | number) {
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

export function getFallbackAvatarInitials(email: string | undefined): string {
    if (typeof email === "undefined") return "CN";

    const [emailUsername = ""] = email.split('@');
    const parts = emailUsername.split(/[\._-]+/).filter(Boolean);
    if (parts.length >= 2) {
        // @ts-ignore we are sure parts[0] and parts[1] exist
        return (parts[0]?.charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return emailUsername.slice(0, 2).toUpperCase();
}
