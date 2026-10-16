import { Download, UploadCloud } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { formatBytes } from "@/components/dashboard/database/backups/restore-backup";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { api } from "@/utils/api";
import { DestinationSelect } from "./destination-select";
import { isPassphraseValid, PassphraseFields } from "./passphrase-fields";
import { RequirementsList } from "./requirements-list";
import {
	defaultScopeFormState,
	hasDropSourceInScope,
	type ProjectEnvironment,
	ScopeForm,
	type ScopeFormState,
} from "./scope-form";
import { TransferProgress } from "./transfer-progress";

const STEPS = ["Select services", "Scope", "Review", "Export"] as const;

interface ExportWizardProps {
	title: string;
	projectId: string;
	environments: ProjectEnvironment[];
	destinationId?: string;
	onClose: () => void;
	onBackFromStart?: () => void;
}

export const ExportWizard = ({
	title,
	projectId,
	environments,
	destinationId: fixedDestinationId,
	onClose,
	onBackFromStart,
}: ExportWizardProps) => {
	const [step, setStep] = useState(0);
	const [form, setForm] = useState<ScopeFormState>(() =>
		defaultScopeFormState(environments),
	);
	const [passphrase, setPassphrase] = useState("");
	const [passphraseConfirm, setPassphraseConfirm] = useState("");
	const [exportId, setExportId] = useState<string | null>(null);
	const [deliverKind, setDeliverKind] = useState<"download" | "destination">(
		fixedDestinationId ? "destination" : "download",
	);
	const [destinationId, setDestinationId] = useState(fixedDestinationId ?? "");

	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: destinations } = api.destination.all.useQuery(undefined, {
		enabled: !!fixedDestinationId,
	});
	const effectiveDeliverKind =
		isCloud || fixedDestinationId ? "destination" : deliverKind;

	const previewQuery = api.projectExportImport.exportPreview.useQuery(
		{
			projectId,
			environmentIds: form.environmentIds,
			serviceIds: form.serviceIds,
			files: form.files,
			dumps: form.dumps,
		},
		{ enabled: step === 2 },
	);

	const { mutateAsync: startExport, isPending: isStarting } =
		api.projectExportImport.exportStart.useMutation({
			onError: (error) => toast.error(error.message),
		});

	const statusQuery = api.projectExportImport.exportStatus.useQuery(
		{ exportId: exportId ?? "" },
		{
			enabled: !!exportId,
			refetchIntervalInBackground: true,
			refetchInterval: (query) => {
				const status = query.state.data?.status;
				return status === "done" || status === "error" || status === "cancelled"
					? false
					: 1000;
			},
		},
	);

	const handleStart = async () => {
		try {
			const result = await startExport({
				projectId,
				scope: {
					environmentIds: form.environmentIds,
					serviceIds: form.serviceIds,
					includeEnvSecrets: form.includeEnvSecrets,
					shared: form.shared,
					files: {
						...form.files,
						applicationSources:
							form.files.applicationSources ||
							hasDropSourceInScope(environments, form.serviceIds),
					},
					dumps: form.dumps,
				},
				passphrase,
				deliver:
					effectiveDeliverKind === "destination"
						? { kind: "destination", destinationId }
						: { kind: "download" },
			});
			setExportId(result.exportId);
			setStep(3);
		} catch {}
	};

	const job = statusQuery.data;
	const isDone = job?.status === "done";
	const isFailed = job?.status === "error";
	const canStart =
		isPassphraseValid(passphrase, passphraseConfirm) &&
		(effectiveDeliverKind === "download" || destinationId.length > 0);
	const fixedDestinationName = destinations?.find(
		(destination) => destination.destinationId === fixedDestinationId,
	)?.name;

	return (
		<>
			<DialogHeader>
				<DialogTitle>{title}</DialogTitle>
				<DialogDescription>
					Step {step + 1} of {STEPS.length}: {STEPS[step]}
				</DialogDescription>
			</DialogHeader>

			{step === 0 && (
				<ScopeForm
					section="selection"
					environments={environments}
					value={form}
					onChange={setForm}
				/>
			)}
			{step === 1 && (
				<ScopeForm
					section="options"
					environments={environments}
					value={form}
					onChange={setForm}
				/>
			)}
			{step === 2 && (
				<div className="space-y-4">
					<RequirementsList
						inventory={previewQuery.data?.inventory}
						requirements={previewQuery.data?.requirements}
						warnings={previewQuery.data?.warnings}
						isLoading={previewQuery.isLoading}
					/>
					<AlertBlock type="warning">
						The exported file contains your secrets, encrypted with the
						passphrase below. Anyone with both the file and this passphrase can
						read them, so store it somewhere safe and share it only through a
						separate channel. You'll need this exact passphrase to import the
						bundle later; without it, the export can't be recovered.
					</AlertBlock>
					<div className="space-y-2">
						<Label>Deliver the bundle</Label>
						{fixedDestinationId ? (
							<p className="text-xs text-muted-foreground">
								Uploaded to {fixedDestinationName ?? "the selected destination"}{" "}
								under dokploy-export-import/.
							</p>
						) : isCloud ? (
							<p className="text-xs text-muted-foreground">
								On Dokploy Cloud the bundle is uploaded to one of your
								destinations (S3-compatible storage); direct download isn't
								available.
							</p>
						) : (
							<RadioGroup
								value={deliverKind}
								onValueChange={(value) =>
									setDeliverKind(value as "download" | "destination")
								}
								className="flex gap-4"
							>
								<div className="flex items-center gap-1">
									<RadioGroupItem value="download" id="deliver-download" />
									<Label htmlFor="deliver-download" className="text-sm">
										Download
									</Label>
								</div>
								<div className="flex items-center gap-1">
									<RadioGroupItem
										value="destination"
										id="deliver-destination"
									/>
									<Label htmlFor="deliver-destination" className="text-sm">
										Upload to a destination
									</Label>
								</div>
							</RadioGroup>
						)}
						{!fixedDestinationId && effectiveDeliverKind === "destination" && (
							<DestinationSelect
								value={destinationId}
								onChange={setDestinationId}
								description="Stored under dokploy-export-import/ in the bucket and listed in Settings → Exports."
							/>
						)}
					</div>
					<PassphraseFields
						value={passphrase}
						confirm={passphraseConfirm}
						onValueChange={setPassphrase}
						onConfirmChange={setPassphraseConfirm}
					/>
				</div>
			)}
			{step === 3 && (
				<div className="space-y-4">
					<TransferProgress
						verb="Export"
						job={job}
						done={isDone}
						failed={isFailed}
					/>
					{isDone && job?.warnings && job.warnings.length > 0 && (
						<RequirementsList warnings={job.warnings} />
					)}
					{isDone && job?.deliveredKey && (
						<AlertBlock type="success">
							Uploaded to <span className="font-mono">{job.deliveredKey}</span>
						</AlertBlock>
					)}
					{isDone && job?.downloadToken && (
						<Button asChild className="w-full">
							<a
								href={`/api/project-export-import/download/${job.downloadToken}`}
							>
								<Download className="mr-2 h-4 w-4" />
								Download bundle
								{job.size ? ` (${formatBytes(job.size)})` : ""}
							</a>
						</Button>
					)}
				</div>
			)}

			<DialogFooter>
				{step === 0 && onBackFromStart && (
					<Button variant="outline" onClick={onBackFromStart}>
						Back
					</Button>
				)}
				{step > 0 && step < 3 && (
					<Button variant="outline" onClick={() => setStep((s) => s - 1)}>
						Back
					</Button>
				)}
				{step < 2 && (
					<Button
						onClick={() => setStep((s) => s + 1)}
						disabled={step === 0 && form.serviceIds.length === 0}
					>
						Next
					</Button>
				)}
				{step === 2 && (
					<Button
						onClick={handleStart}
						isLoading={isStarting}
						disabled={!canStart}
					>
						Start export
					</Button>
				)}
				{step === 3 && (
					<Button variant="outline" onClick={onClose}>
						Close
					</Button>
				)}
			</DialogFooter>
		</>
	);
};

interface ExportProjectProps {
	projectId: string;
	environments: ProjectEnvironment[];
	trigger?: ReactNode;
}

export const ExportProject = ({
	projectId,
	environments,
	trigger,
}: ExportProjectProps) => {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{trigger ?? (
					<DropdownMenuItem
						className="w-full cursor-pointer space-x-3"
						onSelect={(e) => e.preventDefault()}
					>
						<UploadCloud className="size-4" />
						<span>Export project</span>
					</DropdownMenuItem>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
				{open && (
					<ExportWizard
						title="Export project"
						projectId={projectId}
						environments={environments}
						onClose={() => setOpen(false)}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
};
