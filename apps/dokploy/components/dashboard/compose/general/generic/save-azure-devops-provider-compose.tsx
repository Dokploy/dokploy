import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	AzureDevopsHookStatus,
	AzureDevopsSourceFields,
	azureSourceValue,
	emptyAzureSource,
} from "@/components/dashboard/shared/azure-devops-source-fields";
import { AzureDevopsIcon } from "@/components/icons/azure-devops-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

export const SaveAzureDevopsProviderCompose = ({
	composeId,
}: {
	composeId: string;
}) => {
	const { data } = api.compose.one.useQuery({ composeId });
	const save = api.compose.update.useMutation();
	const utils = api.useUtils();
	const [source, setSource] = useState(emptyAzureSource);
	const [path, setPath] = useState("./docker-compose.yml");
	const [watchPaths, setWatchPaths] = useState("");
	const [enableSubmodules, setEnableSubmodules] = useState(false);
	useEffect(() => {
		if (data) {
			setSource(azureSourceValue(data));
			setPath(data.composePath || "./docker-compose.yml");
			setWatchPaths(data.watchPaths?.join("\n") || "");
			setEnableSubmodules(data.enableSubmodules);
		}
	}, [data]);
	return (
		<form
			className="space-y-4"
			onSubmit={async (event) => {
				event.preventDefault();
				try {
					await save.mutateAsync({
						composeId,
						...source,
						composePath: path,
						enableSubmodules,
						watchPaths: watchPaths
							.split("\n")
							.map((path) => path.trim())
							.filter(Boolean),
						sourceType: "azureDevops",
						triggerType: "push",
					});
					await Promise.all([
						utils.compose.one.invalidate({ composeId }),
						utils.azureDevops.hookStatus.invalidate(),
					]);
					toast.success("Azure DevOps source saved");
				} catch (error) {
					toast.error(
						error instanceof Error
							? error.message
							: "Could not save Azure DevOps source",
					);
				}
			}}
		>
			<AzureDevopsSourceFields value={source} onChange={setSource} />
			<div className="space-y-2">
				<Label htmlFor="azure-path">Compose path</Label>
				<Input
					id="azure-path"
					required
					value={path}
					onChange={(event) => setPath(event.target.value)}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="azure-watch">Watch paths (one pattern per line)</Label>
				<Textarea
					id="azure-watch"
					value={watchPaths}
					onChange={(event) => setWatchPaths(event.target.value)}
				/>
			</div>
			<label className="flex gap-2 text-sm">
				<input
					type="checkbox"
					checked={enableSubmodules}
					onChange={(event) => setEnableSubmodules(event.target.checked)}
				/>
				Clone submodules in this organization or collection
			</label>
			<Button
				type="submit"
				className="bg-[#0078d4] text-white hover:bg-[#0063b1]"
				isLoading={save.isPending}
				disabled={!source.azureDevopsBranch}
			>
				<AzureDevopsIcon className="text-current" />
				Save source
			</Button>
			<AzureDevopsHookStatus
				serviceType="compose"
				serviceId={composeId}
				source={source}
			/>
		</form>
	);
};
