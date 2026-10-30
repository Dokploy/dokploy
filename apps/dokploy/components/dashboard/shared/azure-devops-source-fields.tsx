import { ExternalLinkIcon } from "lucide-react";
import { AzureDevopsIcon } from "@/components/icons/azure-devops-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

export interface AzureSourceValue {
	azureDevopsId: string;
	azureDevopsProjectId: string;
	azureDevopsProjectName: string;
	azureDevopsRepositoryId: string;
	azureDevopsRepositoryName: string;
	azureDevopsBranch: string;
}
export const emptyAzureSource: AzureSourceValue = {
	azureDevopsId: "",
	azureDevopsProjectId: "",
	azureDevopsProjectName: "",
	azureDevopsRepositoryId: "",
	azureDevopsRepositoryName: "",
	azureDevopsBranch: "",
};
export const azureSourceValue = (
	source: { [K in keyof AzureSourceValue]?: string | null },
): AzureSourceValue => ({
	azureDevopsId: source.azureDevopsId || "",
	azureDevopsProjectId: source.azureDevopsProjectId || "",
	azureDevopsProjectName: source.azureDevopsProjectName || "",
	azureDevopsRepositoryId: source.azureDevopsRepositoryId || "",
	azureDevopsRepositoryName: source.azureDevopsRepositoryName || "",
	azureDevopsBranch: source.azureDevopsBranch || "",
});

export const AzureDevopsSourceFields = ({
	value,
	onChange,
}: {
	value: AzureSourceValue;
	onChange: (value: AzureSourceValue) => void;
}) => {
	const providers = api.azureDevops.providers.useQuery();
	const projects = api.azureDevops.projects.useQuery(
		{ azureDevopsId: value.azureDevopsId },
		{ enabled: !!value.azureDevopsId },
	);
	const repositories = api.azureDevops.repositories.useQuery(
		{
			azureDevopsId: value.azureDevopsId,
			projectId: value.azureDevopsProjectId,
		},
		{ enabled: !!value.azureDevopsId && !!value.azureDevopsProjectId },
	);
	const branches = api.azureDevops.branches.useQuery(
		{
			azureDevopsId: value.azureDevopsId,
			projectId: value.azureDevopsProjectId,
			repositoryId: value.azureDevopsRepositoryId,
		},
		{
			enabled:
				!!value.azureDevopsId &&
				!!value.azureDevopsProjectId &&
				!!value.azureDevopsRepositoryId,
		},
	);
	const selectClass =
		"flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label htmlFor="azure-provider" className="flex items-center gap-2">
					<AzureDevopsIcon className="dark:text-[#5ea0ef]" />
					Provider
				</Label>
				<select
					className={selectClass}
					id="azure-provider"
					required
					value={value.azureDevopsId}
					onChange={(event) =>
						onChange({ ...emptyAzureSource, azureDevopsId: event.target.value })
					}
				>
					<option value="">Select a provider</option>
					{providers.data?.map((provider) => (
						<option key={provider.azureDevopsId} value={provider.azureDevopsId}>
							{provider.gitProvider.name}
						</option>
					))}
				</select>
				{!providers.isPending && !providers.data?.length && (
					<p className="text-sm">
						Add an Azure DevOps provider in Settings → Git Providers.
					</p>
				)}
			</div>
			<div className="space-y-2">
				<Label htmlFor="azure-project">Project</Label>
				<select
					className={selectClass}
					id="azure-project"
					required
					disabled={!value.azureDevopsId || projects.isFetching}
					value={value.azureDevopsProjectId}
					onChange={(event) =>
						onChange({
							...value,
							azureDevopsProjectId: event.target.value,
							azureDevopsProjectName:
								projects.data?.find(
									(project) => project.id === event.target.value,
								)?.name || "",
							azureDevopsRepositoryId: "",
							azureDevopsRepositoryName: "",
							azureDevopsBranch: "",
						})
					}
				>
					<option value="">Select a project</option>
					{projects.data?.map((project) => (
						<option key={project.id} value={project.id}>
							{project.name}
						</option>
					))}
				</select>
			</div>
			<div className="space-y-2">
				<Label htmlFor="azure-repository">Repository</Label>
				<select
					className={selectClass}
					id="azure-repository"
					required
					disabled={!value.azureDevopsProjectId || repositories.isFetching}
					value={value.azureDevopsRepositoryId}
					onChange={(event) => {
						const repository = repositories.data?.find(
							(repository) => repository.id === event.target.value,
						);
						onChange({
							...value,
							azureDevopsRepositoryId: event.target.value,
							azureDevopsRepositoryName: repository?.name || "",
							azureDevopsBranch:
								repository?.defaultBranch?.replace(/^refs\/heads\//, "") || "",
						});
					}}
				>
					<option value="">Select a repository</option>
					{repositories.data?.map((repository) => (
						<option key={repository.id} value={repository.id}>
							{repository.name}
						</option>
					))}
				</select>
			</div>
			<div className="space-y-2">
				<Label htmlFor="azure-branch">Branch</Label>
				<select
					className={selectClass}
					id="azure-branch"
					required
					disabled={!value.azureDevopsRepositoryId || branches.isFetching}
					value={value.azureDevopsBranch}
					onChange={(event) =>
						onChange({ ...value, azureDevopsBranch: event.target.value })
					}
				>
					<option value="">Select a branch</option>
					{branches.data?.map((branch) => (
						<option
							key={branch.name}
							value={branch.name.replace(/^refs\/heads\//, "")}
						>
							{branch.name.replace(/^refs\/heads\//, "")}
						</option>
					))}
				</select>
				{branches.data?.length === 0 && (
					<p className="text-sm">
						This repository has no branches. Push an initial commit to continue.
					</p>
				)}
			</div>
			{[
				...new Set(
					[
						providers.error,
						projects.error,
						repositories.error,
						branches.error,
					].flatMap((error) => (error ? [error.message] : [])),
				),
			].map((message) => (
				<p className="text-sm text-destructive" key={message}>
					{message}
				</p>
			))}
		</div>
	);
};

export const AzureDevopsHookStatus = ({
	serviceId,
	serviceType,
	source,
}: {
	serviceId: string;
	serviceType: "application" | "compose";
	source: AzureSourceValue;
}) => {
	const providers = api.azureDevops.providers.useQuery();
	const provider = providers.data?.find(
		(provider) => provider.azureDevopsId === source.azureDevopsId,
	);
	const serviceHooksUrl =
		provider && source.azureDevopsProjectId
			? `${provider.baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(source.azureDevopsProjectName || source.azureDevopsProjectId)}/_settings/serviceHooks`
			: null;
	const status = api.azureDevops.hookStatus.useQuery({
		serviceId,
		serviceType,
	});
	const sync = api.azureDevops.syncWebhook.useMutation({
		onSuccess: () => status.refetch(),
	});
	return (
		<div className="rounded border p-3 space-y-2 text-sm">
			<p className="flex flex-wrap items-center gap-2">
				<AzureDevopsIcon className="dark:text-[#5ea0ef]" />
				Automatic deployment hook:
				{status.data?.length ? (
					status.data.map((hook) => (
						<Badge
							key={hook.id}
							variant={
								hook.status === "active"
									? "green"
									: hook.status === "error"
										? "red"
										: hook.status === "pending"
											? "yellow"
											: "orange"
							}
						>
							{hook.status}
						</Badge>
					))
				) : (
					<Badge variant="orange">Not configured</Badge>
				)}
			</p>
			{status.data?.map((hook) => (
				<div key={hook.id}>
					{hook.error && <p className="text-destructive">{hook.error}</p>}
					{hook.status === "cleanupPending" && (
						<p>
							Remove subscription{" "}
							{hook.subscriptionId || "with the Dokploy service marker"} at{" "}
							{hook.baseUrl}, project {hook.projectId}.
						</p>
					)}
				</div>
			))}
			{status.error && (
				<p className="text-destructive">{status.error.message}</p>
			)}
			<div className="flex items-center gap-2">
				<Button
					type="button"
					variant="outline"
					className="border-[#0078d4]/30 text-[#0078d4] hover:bg-[#0078d4]/10 hover:text-[#0063b1] dark:text-[#5ea0ef] dark:hover:text-[#8fc2ff]"
					isLoading={sync.isPending}
					onClick={() => sync.mutate({ serviceId, serviceType })}
				>
					Retry hook synchronization
				</Button>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="border-[#0078d4]/30 text-[#0078d4] hover:bg-[#0078d4]/10 hover:text-[#0063b1] dark:text-[#5ea0ef] dark:hover:text-[#8fc2ff]"
							aria-label="Open Service Hooks in Azure DevOps"
							disabled={!serviceHooksUrl}
							onClick={() => {
								if (serviceHooksUrl)
									window.open(serviceHooksUrl, "_blank", "noopener,noreferrer");
							}}
						>
							<ExternalLinkIcon className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Open Service Hooks in Azure DevOps</TooltipContent>
				</Tooltip>
			</div>
			{sync.error && <p className="text-destructive">{sync.error.message}</p>}
		</div>
	);
};
