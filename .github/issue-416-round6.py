from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


# Force certificate verification on for FTP even if the execution environment
# sets insecure rclone defaults. Command-line options override RCLONE_* env.
utils = Path("packages/server/src/utils/backups/utils.ts")
text = utils.read_text()
old = """\t\tif (destination.secretAccessKey) {
\t\t\tconst obscuredPassword = await obscureRclonePassword(
\t\t\t\tdestination.secretAccessKey,
\t\t\t);
\t\t\tflags.push(`--${backend}-pass=${quote([obscuredPassword])}`);
\t\t}
\t\tflags.push(...additionalFlags);
\t\treturn {
"""
new = """\t\tif (destination.secretAccessKey) {
\t\t\tconst obscuredPassword = await obscureRclonePassword(
\t\t\t\tdestination.secretAccessKey,
\t\t\t);
\t\t\tflags.push(`--${backend}-pass=${quote([obscuredPassword])}`);
\t\t}
\t\tflags.push(...additionalFlags);
\t\tif (provider === RCLONE_DESTINATION_PROVIDERS.FTP) {
\t\t\t// CLI options override RCLONE_* environment defaults. Keep TLS
\t\t\t// certificate verification enabled on the execution host.
\t\t\tflags.push(
\t\t\t\t"--ftp-no-check-certificate=false",
\t\t\t\t"--no-check-certificate=false",
\t\t\t);
\t\t}
\t\treturn {
"""
text = replace_once(text, old, new, "FTP secure CLI overrides")
utils.write_text(text)

# Replace the small redaction helper after structural guards. The regex models
# a complete POSIX shell word as a sequence of quoted, escaped, or plain chunks.
redact = Path("packages/server/src/utils/backups/redact.ts")
existing = redact.read_text()
for marker in (
    "export const redactRcloneCredentials",
    "sftp-key-file-pass",
    "export const getSafeRcloneErrorMessage",
):
    if marker not in existing:
        raise SystemExit(f"redact.ts audited marker missing: {marker}")
redact.write_text(
    r'''/**
 * Redacts credentials from rclone command strings before they reach logs or
 * user-facing error output. Handles both the existing S3 flags and the
 * provider-specific FTP/SFTP credential flags used by backup destinations.
 */
export const redactRcloneCredentials = (command: string): string => {
	return command.replace(
		/(--(?:s3-access-key-id|s3-secret-access-key|ftp-pass|sftp-pass|sftp-key-file-pass)=)(?:(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\\[^\r\n]|[^\s"'\\])+)/g,
		'$1"[REDACTED]"',
	);
};

export const getSafeRcloneErrorMessage = (error: unknown): string =>
	redactRcloneCredentials(
		error instanceof Error ? error.message : String(error),
	);
'''
)

# Adversarial test using the same shell-quote implementation as production.
test = Path("apps/dokploy/__test__/backups/redact-credentials.test.ts")
text = test.read_text()
if 'from "shell-quote"' not in text:
    text = replace_once(
        text,
        'import { describe, expect, it } from "vitest";',
        'import { quote } from "shell-quote";\nimport { describe, expect, it } from "vitest";',
        "shell-quote test import",
    )
extra = '''
\tit("should fully redact shell-quote output with embedded quotes and whitespace", () => {
\t\tconst secret = "PART_A' PART_B\\\" $PART_C;\\\\PART_D";
\t\tconst cmd = `rclone lsf --s3-secret-access-key=${quote([secret])} --s3-region=us-east-1 :s3:bucket`;
\t\tconst redacted = redactRcloneCredentials(cmd);

\t\tfor (const fragment of ["PART_A", "PART_B", "PART_C", "PART_D"]) {
\t\t\texpect(redacted).not.toContain(fragment);
\t\t}
\t\texpect(redacted).toContain('--s3-secret-access-key="[REDACTED]"');
\t\texpect(redacted).toContain("--s3-region=us-east-1");
\t});
'''
idx = text.rfind("\n});")
if idx == -1:
    raise SystemExit("redaction test describe end not found")
if "fully redact shell-quote output" not in text:
    text = text[:idx] + extra + text[idx:]
test.write_text(text)

# Verify generated FTP flags pin certificate verification to the secure value.
backup_test = Path("apps/dokploy/__test__/utils/backups.test.ts")
text = backup_test.read_text()
extra = '''
\ttest("forces certificate verification on after user flags", async () => {
\t\tconst result = await getRclonePathAndFlags(
\t\t\tdestination({
\t\t\t\tprovider: RCLONE_DESTINATION_PROVIDERS.FTP,
\t\t\t\tendpoint: "storage.example.com",
\t\t\t\taccessKey: "backup-user",
\t\t\t\tsecretAccessKey: "",
\t\t\t\tregion: "",
\t\t\t\tbucket: "backups",
\t\t\t\tadditionalFlags: ["--ftp-explicit-tls"],
\t\t\t}),
\t\t);
\t\texpect(result.flags.slice(-2)).toEqual([
\t\t\t"--ftp-no-check-certificate=false",
\t\t\t"--no-check-certificate=false",
\t\t]);
\t});
'''
idx = text.rfind("\n});")
if idx == -1:
    raise SystemExit("FTP TLS test describe end not found")
if "forces certificate verification on after user flags" not in text:
    text = text[:idx] + extra + text[idx:]
backup_test.write_text(text)
