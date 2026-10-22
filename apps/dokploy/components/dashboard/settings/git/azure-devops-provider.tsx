import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AzureDevopsIcon } from "@/components/icons/azure-devops-icon";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";

export const AzureDevopsProviderDialog = ({
	azureDevopsId,
}: {
	azureDevopsId?: string;
}) => {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [baseUrl, setBaseUrl] = useState("");
	const [token, setToken] = useState("");
	const { data, isPending } = api.azureDevops.one.useQuery(
		{ azureDevopsId: azureDevopsId || "" },
		{ enabled: !!azureDevopsId && open },
	);
	const create = api.azureDevops.create.useMutation();
	const update = api.azureDevops.update.useMutation();
	const test = api.azureDevops.testConnection.useMutation();
	const utils = api.useUtils();
	useEffect(() => {
		if (open) {
			setName(data?.gitProvider.name || "");
			setBaseUrl(data?.baseUrl || "");
			setToken("");
		}
	}, [data, open]);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant={azureDevopsId ? "ghost" : "default"}
					className={
						azureDevopsId
							? "text-[#0078d4] hover:text-[#0063b1] dark:text-[#5ea0ef] dark:hover:text-[#8fc2ff]"
							: "bg-[#0078d4] text-white hover:bg-[#0063b1]"
					}
				>
					<AzureDevopsIcon className="text-current" />
					{azureDevopsId ? "Edit Azure DevOps" : "Azure DevOps"}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<AzureDevopsIcon className="size-5 dark:text-[#5ea0ef]" />
						Azure DevOps provider
					</DialogTitle>
				</DialogHeader>
				<form
					className="space-y-4"
					onSubmit={async (event) => {
						event.preventDefault();
						try {
							if (azureDevopsId)
								await update.mutateAsync({
									azureDevopsId,
									name,
									baseUrl,
									...(token ? { personalAccessToken: token } : {}),
								});
							else
								await create.mutateAsync({
									name,
									baseUrl,
									personalAccessToken: token,
								});
							await Promise.all([
								utils.gitProvider.getAll.invalidate(),
								utils.azureDevops.providers.invalidate(),
							]);
							toast.success("Azure DevOps provider saved");
							setToken("");
							setOpen(false);
						} catch (error) {
							toast.error(
								error instanceof Error
									? error.message
									: "Could not save provider",
							);
						}
					}}
				>
					<div className="space-y-2">
						<Label htmlFor="azure-name">Name</Label>
						<Input
							id="azure-name"
							required
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="azure-url">Organization or collection URL</Label>
						<Input
							id="azure-url"
							type="url"
							placeholder="https://azure-devops.visualstudio.com"
							aria-describedby="azure-url-help"
							required
							value={baseUrl}
							onChange={(event) => setBaseUrl(event.target.value)}
						/>
						<p id="azure-url-help" className="text-sm text-muted-foreground">
							Services: https://azure-devops.visualstudio.com
							<br />
							or https://dev.azure.com/azure-devops
							<br />
							Server: https://ado.example.com/DefaultCollection
							<br />
							Include the collection path and /tfs if your Server URL uses it.
						</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="azure-token">Personal access token</Label>
						<Input
							id="azure-token"
							type="password"
							autoComplete="new-password"
							required={!azureDevopsId}
							value={token}
							onChange={(event) => setToken(event.target.value)}
						/>
						<p className="text-sm text-muted-foreground">
							{azureDevopsId ? "Leave empty to keep the current PAT. " : ""}
							Grant repository read access and Service Hooks subscription
							permissions for automatic deployments.
						</p>
					</div>
					<div className="flex gap-2 justify-end">
						{azureDevopsId && (
							<Button
								type="button"
								variant="outline"
								isLoading={test.isPending}
								onClick={async () => {
									try {
										const result = await test.mutateAsync({ azureDevopsId });
										toast.success(
											`Connected: ${result.projectCount} accessible projects`,
										);
									} catch (error) {
										toast.error(
											error instanceof Error
												? error.message
												: "Connection failed",
										);
									}
								}}
							>
								Test saved connection
							</Button>
						)}
						<Button
							type="submit"
							className="bg-[#0078d4] text-white hover:bg-[#0063b1]"
							disabled={!!azureDevopsId && isPending}
							isLoading={create.isPending || update.isPending}
						>
							Save
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
};

export const AzureDevopsCleanupNotice = () => {
	const { data } = api.azureDevops.cleanupPending.useQuery();
	if (!data?.length) return null;
	return (
		<div className="rounded border p-3 text-sm space-y-2">
			<p>Azure DevOps subscriptions requiring cleanup</p>
			{data.map((hook) => (
				<p key={hook.id}>
					{hook.baseUrl} · Project {hook.projectId} · Subscription{" "}
					{hook.subscriptionId || "unknown; locate the Dokploy service marker"}:{" "}
					{hook.error}
				</p>
			))}
		</div>
	);
};
