import { formatDistanceToNow } from "date-fns";
import { Box, ServerIcon, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { DateTooltip } from "@/components/shared/date-tooltip";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";
import { SandboxStatusBadge } from "./sandbox-status-badge";

interface Props {
	projectId: string;
	environmentId: string;
}

export const formatExpiresIn = (expiresAt: Date | null, status: string) => {
	if (status !== "running" || !expiresAt) return "—";
	if (expiresAt.getTime() <= Date.now()) return "expired";
	return formatDistanceToNow(expiresAt, { addSuffix: true });
};

export const ShowSandboxes = ({ projectId, environmentId }: Props) => {
	const utils = api.useUtils();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const { data: sandboxes, isLoading } = api.sandbox.list.useQuery(
		{ environmentId },
		{ refetchInterval: 10_000 },
	);
	const { mutateAsync: kill } = api.sandbox.kill.useMutation();

	if (isLoading) {
		return (
			<div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
				Loading...
			</div>
		);
	}

	if (!sandboxes || sandboxes.length === 0) {
		return (
			<div className="flex min-h-[40vh] w-full flex-col items-center justify-center gap-2">
				<Box className="size-8 text-muted-foreground" />
				<span className="font-medium text-muted-foreground">
					No sandboxes yet. Create one from the UI or through the API.
				</span>
			</div>
		);
	}

	return (
		<div className="rounded-lg border overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead>Image</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Server</TableHead>
						<TableHead>CPU / RAM</TableHead>
						<TableHead>Expires</TableHead>
						<TableHead>Created</TableHead>
						<TableHead className="text-right">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{sandboxes.map((sandbox) => (
						<TableRow key={sandbox.sandboxId}>
							<TableCell className="font-medium">
								<Link
									href={`/dashboard/project/${projectId}/environment/${environmentId}/sandboxes/${sandbox.sandboxId}`}
									className="hover:underline"
								>
									{sandbox.name}
								</Link>
							</TableCell>
							<TableCell className="font-mono text-xs">
								{sandbox.image}
							</TableCell>
							<TableCell>
								<SandboxStatusBadge status={sandbox.status} />
							</TableCell>
							<TableCell>
								<span className="flex items-center gap-1.5 text-sm">
									<ServerIcon className="size-3.5 text-muted-foreground" />
									{sandbox.server?.name ?? "Dokploy Server"}
								</span>
							</TableCell>
							<TableCell className="text-sm">
								{sandbox.cpu} vCPU / {sandbox.memoryMb} MB
							</TableCell>
							<TableCell className="text-sm text-muted-foreground">
								{formatExpiresIn(sandbox.expiresAt, sandbox.status)}
							</TableCell>
							<TableCell className="text-sm">
								<DateTooltip date={sandbox.createdAt} />
							</TableCell>
							<TableCell className="text-right">
								{sandbox.status === "running" &&
									permissions?.deployment.create && (
										<DialogAction
											title="Kill sandbox"
											description={`The container for "${sandbox.name}" will be stopped and removed.`}
											onClick={async () => {
												await kill({ sandboxId: sandbox.sandboxId })
													.then(() => {
														toast.success("Sandbox killed");
														utils.sandbox.list.invalidate({ environmentId });
													})
													.catch(() =>
														toast.error("Error killing the sandbox"),
													);
											}}
										>
											<Button variant="ghost" size="icon">
												<Trash2 className="size-4 text-destructive" />
											</Button>
										</DialogAction>
									)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
};
