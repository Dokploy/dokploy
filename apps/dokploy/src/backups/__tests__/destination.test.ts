import { DestinationType, getBackupCommand, BackupDestination } from '../destination';

describe('Backup Destination command generation', () => {
	it('generates a local copy command', () => {
		const dest: BackupDestination = {
			id: '1',
			name: 'local-test',
			type: DestinationType.LOCAL,
			config: {
				path: '/var/backups/dokploy',
			},
		};

		const cmd = getBackupCommand(dest, '/tmp/backup-2024-01-01');
		expect(cmd).toBe(
			`mkdir -p "/var/backups/dokploy" && cp -a "/tmp/backup-2024-01-01/." "/var/backups/dokploy/"`
		);
	});

	it('generates an rclone copy command with flags', () => {
		const dest: BackupDestination = {
			id: '2',
			name: 'gdrive-test',
			type: DestinationType.RCLONE,
			config: {
				remote: 'gdrive:my-backups',
				flags: ['--progress', '--transfers=4'],
			},
		};

		const cmd = getBackupCommand(dest, '/tmp/backup-2024-01-01');
		expect(cmd).toBe(
			`rclone copy --progress --transfers=4 "/tmp/backup-2024-01-01" "gdrive:my-backups"`
		);
	});

	it('throws on missing config for local', () => {
		const dest: BackupDestination = {
			id: '3',
			name: 'bad-local',
			type: DestinationType.LOCAL,
			// @ts-expect-error – intentionally malformed for test
			config: {},
		};

		expect(() => getBackupCommand(dest as any, '/tmp/backup')).toThrow(
			'Local destination requires a path'
		);
	});

	it('throws on missing config for rclone', () => {
		const dest: BackupDestination = {
			id: '4',
			name: 'bad-rclone',
			type: DestinationType.RCLONE,
			// @ts-expect-error – intentionally malformed for test
			config: {},
		};

		expect(() => getBackupCommand(dest as any, '/tmp/backup')).toThrow(
			'Rclone destination requires a remote'
		);
	});
});
