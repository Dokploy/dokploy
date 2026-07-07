/**
 * Resolves the organization membership limit from the environment.
 *
 * - If ORG_MEMBERSHIP_LIMIT is set to a valid positive number, returns that number.
 * - Otherwise returns undefined, letting better-auth use its built-in default (100).
 */
export function resolveOrgMembershipLimit(): number | undefined {
	const raw = process.env.ORG_MEMBERSHIP_LIMIT;
	if (!raw) return undefined;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
	return parsed;
}
