import { z } from "zod";

const RESERVED_ROLE_NAMES = new Set(["owner", "admin", "member"]);

export const isReservedRoleName = (name: string) =>
	RESERVED_ROLE_NAMES.has(name);

export const customRoleNameSchema = z
	.string()
	.trim()
	.min(1, "Role name is required")
	.max(50, "Role name must be 50 characters or less")
	.regex(
		/^[a-zA-Z0-9_-]+$/,
		"Only letters, numbers, hyphens, and underscores allowed",
	)
	.refine(
		(name) => !isReservedRoleName(name),
		"Cannot use reserved role names (owner, admin, member)",
	);
