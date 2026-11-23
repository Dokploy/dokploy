import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";

interface Props {
	path: string;
	serverId?: string;
}

export const ShowCaddyFile = ({ path, serverId }: Props) => {
	const generated = path.endsWith("/Caddyfile");
	const { data, isLoading, refetch } = api.settings.readTraefikFile.useQuery(
		{ path, serverId },
		{ enabled: !!path },
	);
	const { mutateAsync, isPending, error } =
		api.settings.updateTraefikFile.useMutation();
	const [value, setValue] = useState("");

	useEffect(() => {
		setValue(data || "");
	}, [data]);

	if (isLoading) {
		return (
			<div className="flex h-[55vh] w-full items-center justify-center">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{error && <AlertBlock type="error">{error.message}</AlertBlock>}
			<div className="flex flex-col gap-1">
				<Label>Caddy config</Label>
				<p className="break-all text-sm text-muted-foreground">{path}</p>
			</div>
			<CodeEditor
				lineWrapping
				language="shell"
				wrapperClassName="h-140 font-mono"
				readOnly={generated}
				value={value}
				onChange={setValue}
			/>
			{generated ? (
				<p className="text-sm text-muted-foreground">
					Dokploy regenerates this file on every change. Your own configuration
					goes in global/ and sites/.
				</p>
			) : (
				<div className="flex justify-end">
					<Button
						isLoading={isPending}
						disabled={!value.trim()}
						onClick={() =>
							mutateAsync({ path, traefikConfig: value, serverId })
								.then(() => {
									toast.success("Caddy config Updated");
									refetch();
								})
								.catch(() => {
									toast.error("Error updating the Caddy config");
								})
						}
					>
						Update
					</Button>
				</div>
			)}
		</div>
	);
};
