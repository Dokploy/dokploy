// Relative path allowed for the Dokploy-generated env file, written under
// the Dockerfile directory. Restricted so it can't traverse out of the build
// directory or break out of the shell redirection in createEnvFileCommand:
// - each path segment: alphanumerics, dots, hyphens, underscores only (no
//   shell metacharacters, no whitespace)
// - no leading `/` (not an absolute path)
// - no `..` substring (no directory traversal)
// - no segment starting with `-` (no accidental interpretation as a CLI flag)
// - no segment equal to `.` (would resolve to a directory, breaking the
//   shell redirection)
export const VALID_ENV_FILE_NAME_REGEX =
	/^(?!-)(?!.*\/-)(?!.*\.\.)(?!.*(?:^|\/)\.(?:\/|$))(?:[a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+$/;

export const ENV_FILE_NAME_MESSAGE =
	"Env file name must be a relative path of segments using letters, digits, dots, hyphens and underscores, without '..' and without any segment starting with '-'";
