import { Download, KeyRound, Package, Trash2, UploadCloud } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatBytes } from "@/components/dashboard/database/backups/restore-backup";
import {
	BundleListState,
	BundleMeta,
	DestinationSelect,
} from "@/components/dashboard/project/export-import/destination-select";
import { ExportWizard } from "@/components/dashboard/project/export-import/export-wizard";
import { ImportProject } from "@/components/dashboard/project/export-import/import-project";
import {
	isPassphraseValid,
	MIN_PASSPHRASE_LENGTH,
	PassphraseField,
	PassphraseFields,
} from "@/components/dashboard/project/export-import/passphrase-fields";
import { allServiceIdsOf } from "@/components/dashboard/project/export-import/scope-form";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

const ORGANIZATION = "__organization__";

const OrganizationExport = ({
	destinationId,
	onBack,
	onDone,
}: {
	destinationId: string;
	onBack: () => void;
	onDone: () => void;
}) => {
	const [passphrase, setPassphrase] = useState("");
	const [confirm, setConfirm] = useState("");
	const [excluded, setExcluded] = useState<Set<string>>(new Set());
	const [exports, setExports] = useState<
		{ projectId: string; name: string; exportId: string }[]
	>([]);
	const { data: projects } = api.project.all.useQuery();
	const selectedProjectIds = (projects ?? [])
		.map((project) => project.projectId)
		.filter((projectId) => !excluded.has(projectId));
	const toggleProject = (projectId: string, checked: boolean) =>
		setExcluded((prev) => {
			const next = new Set(prev);
			if (checked) next.delete(projectId);
			else next.add(projectId);
			return next;
		});
	const { mutateAsync: start, isPending } =
		api.projectExportImport.exportOrganizationStart.useMutation({
			onError: (error) => toast.error(error.message),
		});
	const status = api.projectExportImport.exportBatchStatus.useQuery(
		{ exportIds: exports.map((entry) => entry.exportId) },
		{
			enabled: exports.length > 0,
			refetchIntervalInBackground: true,
			refetchInterval: (query) =>
				query.state.data?.every(
					(entry) => entry.status === "done" || entry.status === "error",
				)
					? false
					: 1000,
		},
	);
	const finished =
		exports.length > 0 &&
		!!status.data?.every(
			(entry) => entry.status === "done" || entry.status === "error",
		);

	const handleStart = async () => {
		try {
			const result = await start({
				destinationId,
				passphrase,
				projectIds: selectedProjectIds,
			});
			setExports(result.exports);
			if (result.skipped.length > 0) {
				toast.warning(
					`Skipped ${result.skipped.map((entry) => entry.name).join(", ")}`,
					{ description: result.skipped[0]?.reason },
				);
			}
		} catch {}
	};

	return (
		<>
			<DialogHeader>
				<DialogTitle>Export organization</DialogTitle>
				<DialogDescription>
					{exports.length > 0
						? `Step 2 of 2: Export (${exports.length} projects)`
						: "Step 1 of 2: Select projects"}
				</DialogDescription>
			</DialogHeader>
			{exports.length > 0 ? (
				<div className="space-y-2">
					{exports.map((entry) => {
						const state = status.data?.find(
							(row) => row.exportId === entry.exportId,
						);
						return (
							<div
								key={entry.exportId}
								className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm"
							>
								<span className="font-medium">{entry.name}</span>
								<span
									className={`truncate text-xs ${state?.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
								>
									{state?.status === "done"
										? `Uploaded${state.size ? ` (${formatBytes(state.size)})` : ""}`
										: state?.status === "error"
											? state.error
											: (state?.message ?? "Waiting...")}
								</span>
							</div>
						);
					})}
				</div>
			) : (
				<div className="space-y-4">
					<div className="space-y-1">
						<div className="flex items-center justify-between">
							<Label className="text-xs">
								Projects ({selectedProjectIds.length} of {projects?.length ?? 0}
								)
							</Label>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-auto px-2 py-1 text-xs"
								onClick={() =>
									setExcluded(
										excluded.size === 0
											? new Set((projects ?? []).map((p) => p.projectId))
											: new Set(),
									)
								}
							>
								{excluded.size === 0 ? "Deselect all" : "Select all"}
							</Button>
						</div>
						<div className="max-h-[220px] space-y-1 overflow-y-auto rounded-md border p-2">
							{projects?.map((project) => (
								<label
									key={project.projectId}
									htmlFor={`org-export-${project.projectId}`}
									className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted"
								>
									<Checkbox
										id={`org-export-${project.projectId}`}
										checked={!excluded.has(project.projectId)}
										onCheckedChange={(checked) =>
											toggleProject(project.projectId, checked === true)
										}
									/>
									<span>{project.name}</span>
									<span className="text-xs text-muted-foreground">
										{project.environments.reduce(
											(total, env) => total + allServiceIdsOf(env).length,
											0,
										)}{" "}
										services
									</span>
								</label>
							))}
						</div>
					</div>
					<AlertBlock type="info">
						Each selected project is exported one after another with everything
						in scope: all environments and services, shared resources, files and
						database dumps. Each project becomes its own bundle, built on the
						server where it runs.
					</AlertBlock>
					<AlertBlock type="warning">
						The exported files contain your secrets, encrypted with the
						passphrase below. You'll need this exact passphrase to import them
						later; without it, the exports can't be recovered.
					</AlertBlock>
					<PassphraseFields
						value={passphrase}
						confirm={confirm}
						onValueChange={setPassphrase}
						onConfirmChange={setConfirm}
					/>
				</div>
			)}
			<DialogFooter>
				{exports.length === 0 && (
					<Button variant="outline" onClick={onBack}>
						Back
					</Button>
				)}
				{exports.length === 0 && (
					<Button
						isLoading={isPending}
						disabled={
							!isPassphraseValid(passphrase, confirm) ||
							selectedProjectIds.length === 0
						}
						onClick={handleStart}
					>
						Start export
					</Button>
				)}
				{finished && (
					<Button variant="outline" onClick={onDone}>
						Close
					</Button>
				)}
			</DialogFooter>
		</>
	);
};

const ExportDialogBody = ({
	destinationId,
	onClose,
}: {
	destinationId: string;
	onClose: () => void;
}) => {
	const [target, setTarget] = useState("");
	const { data: projects } = api.project.all.useQuery();
	const project = projects?.find((entry) => entry.projectId === target);

	if (project) {
		return (
			<ExportWizard
				title={`Export ${project.name}`}
				projectId={project.projectId}
				environments={project.environments}
				destinationId={destinationId}
				onClose={onClose}
				onBackFromStart={() => setTarget("")}
			/>
		);
	}
	if (target === ORGANIZATION) {
		return (
			<OrganizationExport
				destinationId={destinationId}
				onBack={() => setTarget("")}
				onDone={onClose}
			/>
		);
	}
	return (
		<>
			<DialogHeader>
				<DialogTitle>Export to destination</DialogTitle>
				<DialogDescription>
					Pick a project to go through the same steps as a project export, or
					export the whole organization.
				</DialogDescription>
			</DialogHeader>
			<div className="grid gap-1">
				<Label className="text-xs">What to export</Label>
				<Select value={target} onValueChange={setTarget}>
					<SelectTrigger>
						<SelectValue placeholder="Select a project or the whole organization" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ORGANIZATION}>
							Whole organization ({projects?.length ?? 0} projects)
						</SelectItem>
						{projects?.map((entry) => (
							<SelectItem key={entry.projectId} value={entry.projectId}>
								{entry.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</>
	);
};

const CheckPassphrase = ({
	destinationId,
	bundleKey,
}: {
	destinationId: string;
	bundleKey: string;
}) => {
	const [open, setOpen] = useState(false);
	const [passphrase, setPassphrase] = useState("");
	const [result, setResult] = useState<string | null>(null);
	const { mutateAsync: verify, isPending } =
		api.projectExportImport.verifyBundlePassphrase.useMutation({
			onError: (error) => toast.error(error.message),
		});

	const handleCheck = async () => {
		try {
			const outcome = await verify({
				destinationId,
				key: bundleKey,
				passphrase,
			});
			setResult(
				!outcome.checked
					? "This bundle can't be checked without downloading it (older format)."
					: outcome.valid
						? "The passphrase is valid for this bundle."
						: "Wrong passphrase for this bundle.",
			);
		} catch {}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					setPassphrase("");
					setResult(null);
				}
			}}
		>
			<DialogTrigger asChild>
				<Button variant="ghost" size="sm" title="Check passphrase">
					<KeyRound className="h-4 w-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Check passphrase</DialogTitle>
					<DialogDescription className="break-all font-mono text-xs">
						{bundleKey}
					</DialogDescription>
				</DialogHeader>
				<PassphraseField
					id="check-passphrase"
					label="Passphrase"
					value={passphrase}
					onChange={setPassphrase}
				/>
				{result && <p className="text-sm">{result}</p>}
				<Button
					isLoading={isPending}
					disabled={passphrase.length < MIN_PASSPHRASE_LENGTH}
					onClick={handleCheck}
				>
					Check
				</Button>
			</DialogContent>
		</Dialog>
	);
};

export const ShowExports = () => {
	const [destinationId, setDestinationId] = useState("");
	const [exportOpen, setExportOpen] = useState(false);
	const bundles = api.projectExportImport.listRemoteBundles.useQuery(
		{ destinationId },
		{ enabled: !!destinationId },
	);
	const {
		mutateAsync: deleteBundle,
		isPending: isDeleting,
		variables: deleting,
	} = api.projectExportImport.deleteRemoteBundle.useMutation({
		onSuccess: () => {
			toast.success("Bundle deleted");
			void bundles.refetch();
		},
		onError: (error) => toast.error(error.message),
	});

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl w-full">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<Package className="size-6 text-muted-foreground self-center" />
							Exports
						</CardTitle>
						<CardDescription>
							Project bundles stored under dokploy-export-import/ in your S3
							destinations. Export a project or the whole organization, then
							download, check or delete the bundles from here.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4 py-8 border-t">
						<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
							<DestinationSelect
								value={destinationId}
								onChange={setDestinationId}
							/>
							<Dialog
								open={exportOpen}
								onOpenChange={(next) => {
									setExportOpen(next);
									if (!next) void bundles.refetch();
								}}
							>
								<DialogTrigger asChild>
									<Button disabled={!destinationId}>
										<UploadCloud className="mr-2 h-4 w-4" />
										Export
									</Button>
								</DialogTrigger>
								<DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
									{exportOpen && (
										<ExportDialogBody
											destinationId={destinationId}
											onClose={() => {
												setExportOpen(false);
												void bundles.refetch();
											}}
										/>
									)}
								</DialogContent>
							</Dialog>
							<ImportProject />
						</div>

						{!destinationId && (
							<p className="text-sm text-muted-foreground">
								Pick a destination to list the bundles stored in it.
							</p>
						)}
						<BundleListState query={bundles} />
						{bundles.data && bundles.data.length > 0 && (
							<div className="flex flex-col gap-2">
								{bundles.data.map((bundle) => (
									<div
										key={bundle.key}
										className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3"
									>
										<div className="min-w-0">
											<p className="truncate font-mono text-sm">
												{bundle.key.split("/").at(-1)}
											</p>
											<BundleMeta size={bundle.size} modTime={bundle.modTime} />
										</div>
										<div className="flex shrink-0 items-center gap-1">
											<Button variant="outline" size="sm" asChild>
												<a
													href={`/api/project-export-import/bundle?destinationId=${encodeURIComponent(destinationId)}&key=${encodeURIComponent(bundle.key)}`}
												>
													<Download className="mr-2 h-4 w-4" />
													Download
												</a>
											</Button>
											<CheckPassphrase
												destinationId={destinationId}
												bundleKey={bundle.key}
											/>
											<DialogAction
												title="Delete bundle"
												description={`This removes ${bundle.key} from the destination. It can't be undone.`}
												onClick={() =>
													deleteBundle({ destinationId, key: bundle.key })
												}
											>
												<Button
													variant="ghost"
													size="sm"
													isLoading={isDeleting && deleting?.key === bundle.key}
													className="text-destructive"
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</DialogAction>
										</div>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
