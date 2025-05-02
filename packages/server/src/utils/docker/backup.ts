export const createBackupLabels = (backupId: string) => {
	const labels = [`dokploy.backup.id=${backupId}`];
	return labels;
};
