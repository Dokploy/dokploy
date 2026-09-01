import { ExternalLink, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
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
import { api } from "@/utils/api";

interface Props {
	serverId: string;
	serverName: string;
	children: React.ReactNode;
}

const serviceTypeLabel: Record<string, string> = {
	application: "Application",
	compose: "Compose",
	postgres: "Postgres",
	mysql: "MySQL",
	mariadb: "MariaDB",
	mongo: "MongoDB",
	redis: "Redis",
	libsql: "LibSQL",
};

export const DeleteServerModal = ({
	serverId,
	serverName,
	children,
}: Props) => {
	const [open, setOpen] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const utils = api.useUtils();

	const {
		data: services,
		isLoading,
		refetch,
	} = api.server.getServices.useQuery({ serverId }, { enabled: open });

	const { mutateAsync: deleteApplication } =
		api.application.delete.useMutation();
	const { mutateAsync: deleteCompose } = api.compose.delete.useMutation();
	const { mutateAsync: deletePostgres } = api.postgres.remove.useMutation();
	const { mutateAsync: deleteMysql } = api.mysql.remove.useMutation();
	const { mutateAsync: deleteMariadb } = api.mariadb.remove.useMutation();
	const { mutateAsync: deleteMongo } = api.mongo.remove.useMutation();
	const { mutateAsync: deleteRedis } = api.redis.remove.useMutation();
	const { mutateAsync: deleteLibsql } = api.libsql.remove.useMutation();
	const { mutateAsync: deleteServer, isPending: isDeletingServer } =
		api.server.remove.useMutation();

	const canDelete = (services?.length ?? 0) === 0;

	const handleDeleteService = async (
		service: NonNullable<typeof services>[number],
	) => {
		setDeletingId(service.id);
		try {
			switch (service.type) {
				case "application":
					await deleteApplication({ applicationId: service.id });
					break;
				case "compose":
					await deleteCompose({
						composeId: service.id,
						deleteVolumes: false,
					});
					break;
				case "postgres":
					await deletePostgres({ postgresId: service.id });
					break;
				case "mysql":
					await deleteMysql({ mysqlId: service.id });
					break;
				case "mariadb":
					await deleteMariadb({ mariadbId: service.id });
					break;
				case "mongo":
					await deleteMongo({ mongoId: service.id });
					break;
				case "redis":
					await deleteRedis({ redisId: service.id });
					break;
				case "libsql":
					await deleteLibsql({ libsqlId: service.id });
					break;
			}
			toast.success(`${service.name} deleted successfully`);
			await refetch();
			utils.server.all.invalidate();
		} catch (error: any) {
			toast.error(error.message);
		} finally {
			setDeletingId(null);
		}
	};

	const handleDeleteServer = async () => {
		try {
			await deleteServer({ serverId });
			toast.success(`Server ${serverName} deleted successfully`);
			setOpen(false);
			utils.server.all.invalidate();
		} catch (error: any) {
			toast.error(error.message);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Delete Server</DialogTitle>
					<DialogDescription>
						This will permanently delete "{serverName}" and all associated data.
					</DialogDescription>
				</DialogHeader>

				{isLoading ? (
					<div className="flex justify-center py-6">
						<Loader2 className="size-5 animate-spin text-muted-foreground" />
					</div>
				) : canDelete ? (
					<AlertBlock type="info">
						No services are associated with this server. You can delete it
						safely.
					</AlertBlock>
				) : (
					<div className="flex flex-col gap-3">
						<AlertBlock type="warning">
							This server has {services?.length} service
							{services?.length === 1 ? "" : "s"} associated. Delete them before
							removing the server.
						</AlertBlock>
						<div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
							{services?.map((service) => (
								<div
									key={`${service.type}-${service.id}`}
									className="flex items-center justify-between gap-2 rounded-lg border p-2"
								>
									<div className="flex min-w-0 flex-col gap-1">
										<span className="truncate text-sm font-medium">
											{service.name}
										</span>
										<Badge variant="outline" className="w-fit text-xs">
											{serviceTypeLabel[service.type]}
										</Badge>
									</div>
									<div className="flex shrink-0 items-center gap-1">
										<Link href={service.url} target="_blank">
											<Button variant="ghost" size="icon" className="h-8 w-8">
												<ExternalLink className="h-4 w-4" />
											</Button>
										</Link>
										<DialogAction
											title="Delete Service"
											description={`This will permanently delete "${service.name}" and all its associated data.`}
											onClick={() => handleDeleteService(service)}
										>
											<Button
												variant="ghost"
												size="icon"
												disabled={deletingId === service.id}
												className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
											>
												{deletingId === service.id ? (
													<Loader2 className="h-4 w-4 animate-spin" />
												) : (
													<Trash2 className="h-4 w-4" />
												)}
											</Button>
										</DialogAction>
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						disabled={!canDelete || isDeletingServer}
						onClick={handleDeleteServer}
					>
						Delete Server
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
