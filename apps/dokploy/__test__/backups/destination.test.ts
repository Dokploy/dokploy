import { getUploadCommand, BackupDestination } from '../../src/backup/destination';

describe('Backup Destination command generation', () => {
	it('generates a local copy command', () => {
		const dest: BackupDestination = {
			id: '1',
			name: 'Local',
			type: 'local',
			config: { path: '/var/backups' },
		};
		const cmd = getUploadCommand(dest, '/tmp/archive.tar.gz');
		expect(cmd).toBe('cp -a "/tmp/archive.tar.gz" "/var/backups/"');
	});

	it('generates an rclone command with flags', () => {
		const dest: BackupDestination = {
			id: '2',
			name: 'Rclone',
			type: 'rclone',
			config: {
				remote: 'gdrive',
				remotePath: 'dokploy/backups',
				flags: ['--progress', '--transfers=4'],
			},
		};
		const cmd = getUploadCommand(dest, '/tmp/archive.tar.gz');
		expect(cmd).toBe(
			'rclone copy "/tmp/archive.tar.gz" "gdrive:dokploy/backups" --progress --transfers=4',
		);
	});

	it('throws on missing config for local', () => {
		const dest: BackupDestination = {
			id: '3',
			name: 'BadLocal',
			type: 'local',
			config: {},
		};
		expect(() => getUploadCommand(dest, '/tmp/file')).toThrow(
			'Local destination requires a "path" config property.',
		);
	});

	it('throws on missing config for rclone', () => {
		const dest: BackupDestination = {
			id: '4',
			name: 'BadRclone',
			type: 'rclone',
			config: { remote: 'gdrive' },
		};
		expect(() => getUploadCommand(dest, '/tmp/file')).toThrow(
			'Rclone destination requires "remote" and "remotePath" config properties.',
		);
	});
});
