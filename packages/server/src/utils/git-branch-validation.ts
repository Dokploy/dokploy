// Valid git branch names per git-check-ref-format rules.
// Rejects shell metacharacters that would enable command injection.
export const VALID_BRANCH_REGEX =
	/^(?!-)(?!\/)(?!.*\/\/)(?!.*\.\.)(?!.*@\{)(?!.*(?:^|\/)\.)(?!.*(?:^|\/)[^/]*\.lock(?:\/|$))(?!.*(?:^|\/)[^/]*\.(?:\/|$))(?!.*[/.]$)[A-Za-z0-9._/-]+$/;
