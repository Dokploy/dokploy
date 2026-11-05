import type { inferRouterOutputs } from "@trpc/server";
import { Settings, Trash2 } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/utils/api";

type Repository = inferRouterOutputs<AppRouter>["workflow"]["repository"];

const NONE = "__none__";

const ToggleRow = ({
	title,
	description,
	checked,
	onChange,
}: {
	title: string;
	description: string;
	checked: boolean;
	onChange: (value: boolean) => void;
}) => (
	<div className="flex items-center justify-between gap-4 rounded-lg border p-4">
		<div className="flex flex-col gap-1">
			<span className="text-sm font-medium">{title}</span>
			<span className="text-sm text-muted-foreground">{description}</span>
		</div>
		<Switch checked={checked} onCheckedChange={onChange} />
	</div>
);

const GeneralSettings = ({ repository }: { repository: Repository }) => {
	const router = useRouter();
	const utils = api.useUtils();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const { data: workflowServers } = api.server.workflowServers.useQuery();
	const { mutateAsync: update } = api.workflow.updateRepository.useMutation();
	const { mutateAsync: remove, isPending: isRemoving } =
		api.workflow.removeRepository.useMutation();

	const save = async (values: {
		serverId?: string | null;
		runDokployWorkflows?: boolean;
		runGithubWorkflows?: boolean;
	}) => {
		await update({
			workflowRepositoryId: repository.workflowRepositoryId,
			...values,
		})
			.then(async () => {
				toast.success("Settings updated");
				await Promise.all([
					utils.workflow.repository.invalidate(),
					utils.workflow.workflows.invalidate(),
				]);
			})
			.catch((error) =>
				toast.error("Error updating the settings", {
					description: error.message,
				}),
			);
	};

	return (
		<div className="flex flex-col gap-3">
			<ToggleRow
				title="Run .dokploy/workflows"
				description="Workflows written for Dokploy, in the GitHub Actions format."
				checked={repository.runDokployWorkflows}
				onChange={(runDokployWorkflows) => save({ runDokployWorkflows })}
			/>
			<ToggleRow
				title="Run .github/workflows"
				description="Leave this off if GitHub Actions still runs these, or every workflow will run twice."
				checked={repository.runGithubWorkflows}
				onChange={(runGithubWorkflows) => save({ runGithubWorkflows })}
			/>
			<div className="flex items-center justify-between gap-4 rounded-lg border p-4">
				<div className="flex flex-col gap-1">
					<span className="text-sm font-medium">Workflow server</span>
					<span className="text-sm text-muted-foreground">
						Where this repository's runs execute.
					</span>
				</div>
				<Select
					value={repository.serverId ?? NONE}
					onValueChange={(value) =>
						save({ serverId: value === NONE ? null : value })
					}
				>
					<SelectTrigger className="w-56">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={NONE}>None</SelectItem>
						{workflowServers?.map((server) => (
							<SelectItem key={server.serverId} value={server.serverId}>
								{server.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{permissions?.workflow.delete && (
				<div className="flex items-center justify-between gap-4 rounded-lg border border-red-500/40 p-4">
					<div className="flex flex-col gap-1">
						<span className="text-sm font-medium">Remove repository</span>
						<span className="text-sm text-muted-foreground">
							Deletes its workflows, secrets and run history from Dokploy.
						</span>
					</div>
					<DialogAction
						title="Remove repository"
						description={`Remove ${repository.owner}/${repository.repository} and all its runs from Dokploy? The GitHub repository is not affected.`}
						type="destructive"
						onClick={async () => {
							await remove({
								workflowRepositoryId: repository.workflowRepositoryId,
							})
								.then(async () => {
									toast.success("Repository removed");
									await utils.workflow.repositories.invalidate();
									await router.push("/dashboard/workflows?tab=repositories");
								})
								.catch((error) =>
									toast.error("Error removing the repository", {
										description: error.message,
									}),
								);
						}}
					>
						<Button variant="destructive" size="sm" isLoading={isRemoving}>
							<Trash2 className="size-4" /> Remove
						</Button>
					</DialogAction>
				</div>
			)}
		</div>
	);
};

const SecretsSettings = ({ repository }: { repository: Repository }) => {
	const utils = api.useUtils();
	const [type, setType] = useState<"secret" | "variable">("secret");
	const [name, setName] = useState("");
	const [value, setValue] = useState("");

	const { data: secrets } = api.workflow.secrets.useQuery({
		workflowRepositoryId: repository.workflowRepositoryId,
	});
	const { mutateAsync: upsert, isPending } =
		api.workflow.upsertSecret.useMutation();
	const { mutateAsync: remove } = api.workflow.removeSecret.useMutation();

	const invalidate = () =>
		utils.workflow.secrets.invalidate({
			workflowRepositoryId: repository.workflowRepositoryId,
		});

	const onSave = async () => {
		await upsert({
			workflowRepositoryId: repository.workflowRepositoryId,
			name: name.trim(),
			value,
			type,
		})
			.then(async () => {
				toast.success(type === "secret" ? "Secret saved" : "Variable saved");
				setName("");
				setValue("");
				await invalidate();
			})
			.catch((error) =>
				toast.error("Error saving", { description: error.message }),
			);
	};

	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-muted-foreground">
				Available to workflows as <code>{"${{ secrets.NAME }}"}</code> and{" "}
				<code>{"${{ vars.NAME }}"}</code>. Secret values are encrypted and never
				shown again. <code>GITHUB_TOKEN</code> is provided automatically.
			</p>

			<div className="flex flex-col gap-3 rounded-lg border p-4">
				<div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3">
					<Select
						value={type}
						onValueChange={(v) => setType(v as "secret" | "variable")}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="secret">Secret</SelectItem>
							<SelectItem value="variable">Variable</SelectItem>
						</SelectContent>
					</Select>
					<Input
						placeholder="NAME"
						value={name}
						onChange={(e) => setName(e.target.value.toUpperCase())}
						className="font-mono"
					/>
				</div>
				<Textarea
					placeholder="Value"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					className="font-mono min-h-20"
				/>
				<div className="flex justify-end">
					<Button
						size="sm"
						isLoading={isPending}
						disabled={!name.trim()}
						onClick={onSave}
					>
						Save
					</Button>
				</div>
			</div>

			<div className="flex flex-col gap-2">
				{secrets?.length === 0 && (
					<span className="text-sm text-muted-foreground text-center py-4">
						No secrets or variables yet.
					</span>
				)}
				{secrets?.map((secret) => (
					<div
						key={secret.workflowSecretId}
						className="flex items-center justify-between gap-3 rounded-lg border px-4 py-2"
					>
						<div className="flex flex-col min-w-0">
							<span className="font-mono text-sm">{secret.name}</span>
							<span className="text-xs text-muted-foreground truncate">
								{secret.type === "secret"
									? "Secret · ••••••••"
									: `Variable · ${secret.value}`}
							</span>
						</div>
						<DialogAction
							title={`Delete ${secret.name}`}
							description="Workflows that use it will get an empty value."
							type="destructive"
							onClick={async () => {
								await remove({ workflowSecretId: secret.workflowSecretId })
									.then(invalidate)
									.catch((error) =>
										toast.error("Error deleting", {
											description: error.message,
										}),
									);
							}}
						>
							<Button variant="ghost" size="icon">
								<Trash2 className="size-4 text-red-500" />
							</Button>
						</DialogAction>
					</div>
				))}
			</div>
		</div>
	);
};

export const WorkflowRepositorySettings = ({
	repository,
}: {
	repository: Repository;
}) => (
	<Dialog>
		<DialogTrigger asChild>
			<Button variant="outline">
				<Settings className="size-4" /> Settings
			</Button>
		</DialogTrigger>
		<DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
			<DialogHeader>
				<DialogTitle>
					{repository.owner}/{repository.repository} settings
				</DialogTitle>
				<DialogDescription>
					Choose which workflows run, where they run, and the secrets they
					receive.
				</DialogDescription>
			</DialogHeader>
			<Tabs defaultValue="general">
				<TabsList>
					<TabsTrigger value="general">General</TabsTrigger>
					<TabsTrigger value="secrets">Secrets & Variables</TabsTrigger>
				</TabsList>
				<TabsContent value="general" className="pt-4">
					<GeneralSettings repository={repository} />
				</TabsContent>
				<TabsContent value="secrets" className="pt-4">
					<SecretsSettings repository={repository} />
				</TabsContent>
			</Tabs>
		</DialogContent>
	</Dialog>
);
