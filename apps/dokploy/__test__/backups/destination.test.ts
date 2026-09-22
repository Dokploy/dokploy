import { DestinationType, getBackupCommand } from '../../src/backups/destination';

describe('Legacy test path compatibility', () => {
	it('should still generate correct commands for local destinations', () => {
		const cmd = getBackupCommand(
			{
				id: 'local-1',
				name: 'local',
				type: DestinationType.LOCAL,
				config: { path: '/data/backups' },
			},
			'/tmp/backup',
		);
		expect(cmd).toContain('cp -a');
	});
});
