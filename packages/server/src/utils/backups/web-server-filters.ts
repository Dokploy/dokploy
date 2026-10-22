// rsync excludes for the web-server backup. Every deploy re-clones */code/,
// so its .git history is never needed. The working tree stays in the backup:
// compose bind mounts like ./data live there, and restore replaces BASE_PATH.
export const WEB_SERVER_BACKUP_EXCLUDES = [
	"--exclude='applications/*/code/.git/'",
	"--exclude='compose/*/code/.git/'",
];
