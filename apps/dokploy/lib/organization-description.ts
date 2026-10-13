import { z } from "zod";

export const ORGANIZATION_DESCRIPTION_MAX_LENGTH = 1000;

export const organizationDescriptionSchema = z
	.string()
	.trim()
	.max(ORGANIZATION_DESCRIPTION_MAX_LENGTH, {
		message: `Description must be at most ${ORGANIZATION_DESCRIPTION_MAX_LENGTH} characters`,
	})
	.optional();

function parseMetadata(
	metadata: string | null | undefined,
): Record<string, unknown> {
	if (!metadata) return {};
	const parsed: unknown = JSON.parse(metadata);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error("Organization metadata must be a JSON object");
	}
	return parsed as Record<string, unknown>;
}

export function getOrganizationDescription(
	metadata: string | null | undefined,
) {
	try {
		const { description } = parseMetadata(metadata);
		return typeof description === "string" ? description : "";
	} catch {
		return "";
	}
}

export function setOrganizationDescription(
	metadata: string | null | undefined,
	description: string,
) {
	return JSON.stringify({ ...parseMetadata(metadata), description });
}
