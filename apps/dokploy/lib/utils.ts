import { type ClassValue, clsx } from "clsx";
import { format } from "date-fns";
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

/**
 * Parse Docker timestamp format and return formatted date
 * Handles formats like: "2026-03-06 21:03:06.214730743 +0100 CET"
 */
export function parseDockerTimestamp(timestamp: string): string {
	if (!timestamp) return "-";

	try {
		// Remove timezone name (CET, UTC, etc.) from the end
		const cleanedTimestamp = timestamp.replace(/\s+[A-Z]{3,4}$/, "");

		// Convert format to ISO 8601: "2026-03-06T21:03:06.214+01:00"
		const [datePart, timePart, offsetPart] = cleanedTimestamp.split(" ");

		if (!datePart || !timePart || !offsetPart) {
			throw new Error("Invalid timestamp format");
		}

		// Truncate nanoseconds to milliseconds (3 digits after decimal)
		const [timeBase, nanoseconds] = timePart.split(".");
		const milliseconds = nanoseconds ? nanoseconds.substring(0, 3) : "000";

		// Format offset from "+0100" to "+01:00"
		const formattedOffset =
			offsetPart.length === 5
				? `${offsetPart.slice(0, 3)}:${offsetPart.slice(3)}`
				: offsetPart;

		const isoString = `${datePart}T${timeBase}.${milliseconds}${formattedOffset}`;
		const date = new Date(isoString);

		if (Number.isNaN(date.getTime())) {
			// Fallback: try parsing as regular date
			const fallbackDate = new Date(timestamp);
			if (Number.isNaN(fallbackDate.getTime())) {
				throw new Error("Unable to parse date");
			}
			return format(fallbackDate, "dd/MM/yyyy");
		}

		return format(date, "dd/MM/yyyy");
	} catch {
		return "-";
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
