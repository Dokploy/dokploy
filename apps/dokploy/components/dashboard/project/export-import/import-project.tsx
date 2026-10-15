import { Download, ExternalLink } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { BundleSourceStep } from "./bundle-source-step";
import { type ConflictChoice, ImportSummary } from "./import-summary";
import { AutofillDecoy, PassphraseField } from "./passphrase-fields";
import { RequirementsList } from "./requirements-list";
import {
	defaultResolutionChoices,
	type ResolutionChoice,
	ResolutionStep,
} from "./resolution-step";
import { SecretsReview } from "./secrets-review";
import { TransferProgress } from "./transfer-progress";
import { VersionsTable } from "./versions-table";

const STEPS = ["Source", "Unlock", "Resolve", "Review", "Import"] as const;

type TargetChoice =
	| { kind: "newProject"; name: string }
	| { kind: "existingProject"; projectId: string; environmentName: string };

interface ImportProjectProps {
	initialBundle?: { destinationId: string; key: string };
	trigger?: ReactNode;
}

export const ImportProject = ({
	initialBundle,
	trigger,
}: ImportProjectProps = {}) => {
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState(0);
	const [importId, setImportId] = useState<string | null>(null);
	const [importServerId, setImportServerId] = useState<string | undefined>();
	const [passphrase, setPassphrase] = useState("");
	const [resolutionChoices, setResolutionChoices] = useState<
		Record<string, ResolutionChoice>
	>({});
	const [targetKind, setTargetKind] = useState<
		"newProject" | "existingProject"
	>("newProject");
	const [newProjectName, setNewProjectName] = useState("");
	const [existingProjectId, setExistingProjectId] = useState("");
	const [environmentName, setEnvironmentName] = useState("imported");
	const [keepAppNames, setKeepAppNames] = useState(false);
	const [rotateDatabaseCredentials, setRotateDatabaseCredentials] =
		useState(false);
	const [deployAfterImport, setDeployAfterImport] = useState(true);
	const [conflictChoices, setConflictChoices] = useState<
		Record<string, ConflictChoice>
	>({});
	const [secretOverrides, setSecretOverrides] = useState<
		Record<string, string>
	>({});

	const { data: projects } = api.project.all.useQuery(undefined, {
		enabled: open && targetKind === "existingProject",
	});

	const inspectMutation = api.projectExportImport.importInspect.useMutation();
	const [inspectResult, setInspectResult] = useState<Awaited<
		ReturnType<typeof inspectMutation.mutateAsync>
	> | null>(null);
	const runInspect = (id: string) => {
		setInspectResult(null);
		inspectMutation
			.mutateAsync({ importId: id })
			.then(setInspectResult)
			.catch(() => {});
	};
	useEffect(() => {
		if (
			importId &&
			step === 1 &&
			!inspectResult &&
			!inspectMutation.isPending
		) {
			runInspect(importId);
		}
	}, [importId, step]);

	const { mutateAsync: unlock, isPending: isUnlocking } =
		api.projectExportImport.importUnlock.useMutation({
			onError: (error) => toast.error(error.message),
		});
	const [unlockResult, setUnlockResult] = useState<Awaited<
		ReturnType<typeof unlock>
	> | null>(null);

	const { mutateAsync: plan, isPending: isPlanning } =
		api.projectExportImport.importPlan.useMutation({
			onError: (error) => toast.error(error.message),
		});
	const [planResult, setPlanResult] = useState<Awaited<
		ReturnType<typeof plan>
	> | null>(null);

	const { mutateAsync: overrideSecrets } =
		api.projectExportImport.importSecretsOverride.useMutation({
			onError: (error) => toast.error(error.message),
		});

	const { mutateAsync: validate, isPending: isValidating } =
		api.projectExportImport.importValidate.useMutation({
			onError: (error) => toast.error(error.message),
		});
	const [validation, setValidation] = useState<
		{ check: string; ok: boolean; detail?: string }[] | null
	>(null);

	const { mutateAsync: startImport, isPending: isStarting } =
		api.projectExportImport.importStart.useMutation({
			onError: (error) => toast.error(error.message),
		});
	const { mutateAsync: cancelImport } =
		api.projectExportImport.importCancel.useMutation();

	const statusQuery = api.projectExportImport.importStatus.useQuery(
		{ importId: importId ?? "" },
		{
			enabled: !!importId && step === 4,
			refetchIntervalInBackground: true,
			refetchInterval: (query) => {
				const status = query.state.data?.status;
				return status === "done" || status === "failed" ? false : 1000;
			},
		},
	);

	const resetState = () => {
		setStep(0);
		setImportId(null);
		setInspectResult(null);
		setConflictChoices({});
		setSecretOverrides({});
		setValidation(null);
		setDeployAfterImport(true);
		setPassphrase("");
		setResolutionChoices({});
		setTargetKind("newProject");
		setNewProjectName("");
		setExistingProjectId("");
		setEnvironmentName("imported");
		setKeepAppNames(false);
		setRotateDatabaseCredentials(false);
		setUnlockResult(null);
		setPlanResult(null);
	};

	const handleBundleSelected = (id: string, serverId: string | undefined) => {
		setImportServerId(serverId);
		setUnlockResult(null);
		setResolutionChoices({});
		setConflictChoices({});
		setSecretOverrides({});
		setValidation(null);
		setPassphrase("");
		setInspectResult(null);
		setImportId(id);
		setStep(1);
	};

	const handleUnlock = async () => {
		if (!importId) return;
		try {
			const result = await unlock({ importId, passphrase });
			setUnlockResult(result);
			const defaults = defaultResolutionChoices(
				inspectResult?.requirements ?? [],
				result.resolutions,
			);
			if (importServerId) {
				for (const key of Object.keys(defaults)) {
					if (key.startsWith("server:")) {
						defaults[key] = {
							requirementKey: key,
							action: "reuse",
							targetId: importServerId,
						};
					}
				}
			}
			setResolutionChoices(defaults);
			setStep(2);
		} catch {}
	};

	const runPlan = async (choices: Record<string, ConflictChoice>) => {
		if (!importId) return;
		const target: TargetChoice =
			targetKind === "newProject"
				? { kind: "newProject", name: newProjectName }
				: {
						kind: "existingProject",
						projectId: existingProjectId,
						environmentName,
					};
		try {
			await overrideSecrets({ importId, overrides: secretOverrides });
			const result = await plan({
				importId,
				target,
				choices: {
					resolutions: resolutionChoices,
					keepAppNames,
					rotateDatabaseCredentials,
					deployAfterImport,
					conflictResolutions: choices,
				},
			});
			setPlanResult(result);
			setConflictChoices(result.conflictResolutions);
			setStep(3);
			setValidation(null);
			const validated = await validate({ importId });
			setValidation(validated.checks);
		} catch {}
	};

	const handlePlan = () => runPlan(conflictChoices);

	const handleConflictChange = (key: string, choice: ConflictChoice) => {
		setConflictChoices((prev) => ({ ...prev, [key]: choice }));
	};

	const handleStart = async () => {
		if (!importId) return;
		try {
			await startImport({ importId });
			setStep(4);
		} catch {}
	};

	const job = statusQuery.data;
	const isDone = job?.status === "done";
	const isFailed = job?.status === "failed";
	const importedProjectId = job?.result
		? Object.values(job.result.idMap.project ?? {})[0]
		: undefined;
	const importedEnvironmentId = job?.result
		? Object.values(job.result.idMap.environment ?? {})[0]
		: undefined;
	const conflictChoicesDirty =
		JSON.stringify(conflictChoices) !==
		JSON.stringify(planResult?.conflictResolutions ?? {});
	const validationFailing = (validation ?? []).some((check) => !check.ok);
	const canProceedTarget =
		targetKind === "newProject"
			? newProjectName.trim().length > 0
			: !!existingProjectId && environmentName.trim().length > 0;

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					if (importId && step < 4) {
						cancelImport({ importId }).catch(() => {});
					}
					resetState();
				}
			}}
		>
			<DialogTrigger asChild>
				{trigger ?? (
					<Button variant="outline" onClick={(e) => e.stopPropagation()}>
						<Download className="mr-2 h-4 w-4" />
						Import project
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Import project</DialogTitle>
					<DialogDescription>
						Step {step + 1} of {STEPS.length}: {STEPS[step]}
					</DialogDescription>
				</DialogHeader>

				{step === 0 && (
					<BundleSourceStep
						onSelected={handleBundleSelected}
						initialBundle={initialBundle}
					/>
				)}

				{step === 1 && (
					<div className="space-y-4">
						{inspectMutation.isPending && (
							<p className="text-sm text-muted-foreground">Reading bundle...</p>
						)}
						{inspectMutation.isError && (
							<AlertBlock type="error">
								<p>
									{inspectMutation.error?.message ??
										"Failed to read the bundle."}
								</p>
								<Button
									variant="outline"
									size="sm"
									className="mt-2"
									onClick={() => importId && runInspect(importId)}
								>
									Retry
								</Button>
							</AlertBlock>
						)}
						{inspectResult && (
							<div className="text-sm space-y-3">
								<div className="space-y-1">
									<p>
										<span className="text-muted-foreground">Exported: </span>
										{new Date(
											inspectResult.manifest.exportedAt,
										).toLocaleString()}
									</p>
								</div>
								<VersionsTable versions={inspectResult.versions} />
								{inspectResult.versionWarnings.length > 0 && (
									<RequirementsList warnings={inspectResult.versionWarnings} />
								)}
							</div>
						)}
						<AutofillDecoy />
						<PassphraseField
							id="import-passphrase"
							label="Passphrase"
							value={passphrase}
							onChange={setPassphrase}
						/>
					</div>
				)}

				{step === 2 && (
					<div className="space-y-4">
						<ResolutionStep
							requirements={inspectResult?.requirements ?? []}
							resolutions={unlockResult?.resolutions ?? {}}
							choices={resolutionChoices}
							onChange={(key, choice) =>
								setResolutionChoices((prev) => ({ ...prev, [key]: choice }))
							}
						/>

						{importId && (
							<SecretsReview
								importId={importId}
								overrides={secretOverrides}
								onChange={(secretId, value) =>
									setSecretOverrides((prev) => {
										const next = { ...prev };
										if (value === undefined) delete next[secretId];
										else next[secretId] = value;
										return next;
									})
								}
							/>
						)}

						<div className="space-y-3 border-t pt-4">
							<Label>Import into</Label>
							<RadioGroup
								value={targetKind}
								onValueChange={(value) =>
									setTargetKind(value as "newProject" | "existingProject")
								}
								className="flex gap-4"
							>
								<div className="flex items-center gap-1">
									<RadioGroupItem value="newProject" id="target-new" />
									<Label htmlFor="target-new" className="text-sm">
										New project
									</Label>
								</div>
								<div className="flex items-center gap-1">
									<RadioGroupItem
										value="existingProject"
										id="target-existing"
									/>
									<Label htmlFor="target-existing" className="text-sm">
										Existing project
									</Label>
								</div>
							</RadioGroup>

							{targetKind === "newProject" ? (
								<Input
									placeholder="Project name"
									value={newProjectName}
									onChange={(e) => setNewProjectName(e.target.value)}
								/>
							) : (
								<div className="flex gap-2">
									<Select
										value={existingProjectId}
										onValueChange={setExistingProjectId}
									>
										<SelectTrigger className="flex-1">
											<SelectValue placeholder="Select a project" />
										</SelectTrigger>
										<SelectContent>
											{projects?.map((project) => (
												<SelectItem
													key={project.projectId}
													value={project.projectId}
												>
													{project.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<Input
										placeholder="New environment name"
										value={environmentName}
										onChange={(e) => setEnvironmentName(e.target.value)}
									/>
								</div>
							)}

							<div className="flex items-start gap-2">
								<Checkbox
									className="mt-0.5"
									checked={keepAppNames}
									onCheckedChange={(checked) =>
										setKeepAppNames(checked === true)
									}
								/>
								<Label className="text-sm">
									Keep original app names when available
								</Label>
							</div>

							<div className="flex items-start gap-2">
								<Checkbox
									className="mt-0.5"
									checked={rotateDatabaseCredentials}
									onCheckedChange={(checked) =>
										setRotateDatabaseCredentials(checked === true)
									}
								/>
								<div className="grid gap-0.5">
									<Label className="text-sm">Rotate database credentials</Label>
									<p className="text-xs text-muted-foreground">
										Generates fresh database passwords for the imported project
										instead of keeping the original ones. Leave this unchecked
										for a straight migration (e.g. cloud to self-hosted) so
										anything outside Dokploy that already has the current
										password keeps working.
									</p>
								</div>
							</div>

							<div className="flex items-start gap-2">
								<Checkbox
									className="mt-0.5"
									checked={deployAfterImport}
									onCheckedChange={(checked) =>
										setDeployAfterImport(checked === true)
									}
								/>
								<Label className="text-sm">
									Deploy applications and compose services after import
								</Label>
							</div>
						</div>
					</div>
				)}

				{step === 3 && (
					<div className="space-y-3">
						<ImportSummary
							summary={planResult?.summary}
							pendingServices={planResult?.pendingServices}
							warnings={planResult?.warnings}
							conflicts={planResult?.conflicts}
							conflictChoices={conflictChoices}
							onConflictChange={handleConflictChange}
							validation={validation ?? undefined}
							isValidating={isValidating}
							isLoading={isPlanning}
						/>
						{conflictChoicesDirty && (
							<Button
								variant="outline"
								size="sm"
								disabled={isPlanning}
								onClick={() => runPlan(conflictChoices)}
							>
								Apply conflict choices
							</Button>
						)}
					</div>
				)}

				{step === 4 && (
					<div className="space-y-4">
						<TransferProgress
							verb="Import"
							job={job}
							done={isDone}
							failed={isFailed}
						/>
						{isDone && (
							<div className="space-y-3">
								<AlertBlock type="success">
									{job?.partial
										? "Import completed with some errors."
										: "Import complete."}
								</AlertBlock>
								{job?.restoreErrors && job.restoreErrors.length > 0 && (
									<AlertBlock type="error">
										{job.restoreErrors.map((error) => (
											<p key={error.serviceId} className="text-xs">
												{error.serviceName ?? error.serviceId}: {error.error}
											</p>
										))}
									</AlertBlock>
								)}
								{job?.result?.warnings && job.result.warnings.length > 0 && (
									<RequirementsList warnings={job.result.warnings} />
								)}
								{importedProjectId && importedEnvironmentId && (
									<Button asChild variant="outline">
										<Link
											href={`/dashboard/project/${importedProjectId}/environment/${importedEnvironmentId}`}
										>
											<ExternalLink className="mr-2 h-4 w-4" />
											Open imported project
										</Link>
									</Button>
								)}
							</div>
						)}
					</div>
				)}

				<DialogFooter>
					{step > 0 && step < 4 && (
						<Button
							variant="outline"
							onClick={() => {
								if (step === 1 && importId) {
									cancelImport({ importId }).catch(() => {});
									setImportId(null);
								}
								setStep((s) => Math.max(0, s - 1));
							}}
						>
							Back
						</Button>
					)}
					{step === 1 && (
						<Button
							onClick={handleUnlock}
							isLoading={isUnlocking}
							disabled={passphrase.length === 0}
						>
							Unlock
						</Button>
					)}
					{step === 2 && (
						<Button
							onClick={handlePlan}
							isLoading={isPlanning}
							disabled={!canProceedTarget}
						>
							Preview
						</Button>
					)}
					{step === 3 && (
						<Button
							onClick={handleStart}
							isLoading={isStarting}
							disabled={
								isPlanning ||
								isValidating ||
								validationFailing ||
								conflictChoicesDirty
							}
						>
							Start import
						</Button>
					)}
					{step === 4 && (
						<Button variant="outline" onClick={() => setOpen(false)}>
							Close
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
