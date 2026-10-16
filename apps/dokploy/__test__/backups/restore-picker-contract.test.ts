import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	picker: vi.fn(),
	databaseSubscription: vi.fn(),
	volumeSubscription: vi.fn(),
	form: null as any,
}));

vi.mock("react-hook-form", async (importOriginal) => {
	const original = await importOriginal<typeof import("react-hook-form")>();
	return {
		...original,
		useForm: (options: Parameters<typeof original.useForm>[0]) => {
			const form = original.useForm({
				...options,
				defaultValues: {
					...options?.defaultValues,
					destinationId: "destination-a",
					backupFile: "archive/hourly/selected.sql.gz",
				},
			});
			form.setValue = vi.fn(form.setValue);
			mocks.form = form;
			return form;
		},
	};
});

vi.mock("@/components/ui/dialog", () => {
	const Content = ({ children }: { children: ReactNode }) =>
		createElement(Fragment, null, children);
	return {
		Dialog: Content,
		DialogContent: Content,
		DialogDescription: Content,
		DialogFooter: Content,
		DialogHeader: Content,
		DialogTitle: Content,
		DialogTrigger: Content,
	};
});
vi.mock("@/components/shared/drawer-logs", () => ({ DrawerLogs: () => null }));
vi.mock("@/components/shared/backup-file-picker", () => ({
	BackupFilePicker: (props: unknown) => {
		mocks.picker(props);
		return null;
	},
}));
vi.mock("@/utils/api", () => ({
	api: {
		destination: {
			all: {
				useQuery: () => ({
					data: [
						{ destinationId: "destination-a", name: "Fixture destination" },
					],
				}),
			},
		},
		compose: { loadServices: { useQuery: () => ({ data: [] }) } },
		backup: {
			restoreBackupWithLogs: { useSubscription: mocks.databaseSubscription },
		},
		volumeBackups: {
			restoreVolumeBackupWithLogs: {
				useSubscription: mocks.volumeSubscription,
			},
		},
	},
}));

import { RestoreVolumeBackups } from "@/components/dashboard/application/volume-backups/restore-volume-backups";
import { RestoreBackup } from "@/components/dashboard/database/backups/restore-backup";

beforeEach(() => vi.clearAllMocks());

describe("restore consumers use the paginated picker contract", () => {
	const consumers = [
		[
			"database",
			() =>
				createElement(RestoreBackup, {
					id: "database-a",
					databaseType: "postgres",
					serverId: "server-a",
				}),
		],
		[
			"volume",
			() =>
				createElement(RestoreVolumeBackups, {
					id: "application-a",
					type: "application",
					serverId: "server-a",
				}),
		],
	] as const;

	it.each(consumers)(
		"%s passes the exact listing and selection context",
		(_name, element) => {
			renderToStaticMarkup(element());
			expect(mocks.picker).toHaveBeenCalledTimes(1);
			expect(mocks.picker.mock.calls[0]![0]).toMatchObject({
				destinationId: "destination-a",
				serverId: "server-a",
				enabled: false,
				value: "archive/hourly/selected.sql.gz",
			});
		},
	);
	it.each(consumers)(
		"%s forwards full path selection and clearing to the form",
		(_name, element) => {
			renderToStaticMarkup(element());
			const { onChange } = mocks.picker.mock.calls[0]![0];
			onChange("archive/hourly/path with spaces/2026-01-02T00-00-00-000Z.tar");
			expect(mocks.form.setValue).toHaveBeenLastCalledWith(
				"backupFile",
				"archive/hourly/path with spaces/2026-01-02T00-00-00-000Z.tar",
			);
			onChange("");
			expect(mocks.form.setValue).toHaveBeenLastCalledWith("backupFile", "");
		},
	);
	it.each(consumers)(
		"%s does not start a restore when rendering or selecting",
		(_name, element) => {
			renderToStaticMarkup(element());
			mocks.picker.mock.calls[0]![0].onChange("archive/another.sql.gz");
			const calls = [
				...mocks.databaseSubscription.mock.calls,
				...mocks.volumeSubscription.mock.calls,
			];
			expect(calls).toHaveLength(1);
			expect(calls[0]![1]).toMatchObject({ enabled: false });
		},
	);
});
