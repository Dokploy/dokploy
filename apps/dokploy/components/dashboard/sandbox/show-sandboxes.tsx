import { formatDistanceToNow } from "date-fns";
import { Box, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
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

export const formatExpiresIn = (
	expiresAt: Date | null,
	status: string,
	t?: (key: string) => string,
) => {
	if (status !== "running" || !expiresAt) return "—";
	if (expiresAt.getTime() <= Date.now())
		return t ? t("sandbox.expired") : "expired";
	return formatDistanceToNow(expiresAt, { addSuffix: true });
};

interface Props {
	serverId?: string;
}

export const ShowSandboxes = ({ serverId }: Props) => {
	const { t } = useTranslation();
	const utils = api.useUtils();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const { data: sandboxes, isLoading } = api.sandbox.list.useQuery(
		{ serverId: serverId ?? null },
		{ refetchInterval: 10_000 },
	);
	const { mutateAsync: kill } = api.sandbox.kill.useMutation();

	if (isLoading) {
		return (
			<div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
				{t("common.loading")}
			</div>
		);
	}

	if (!sandboxes || sandboxes.length === 0) {
		return (
			<div className="flex min-h-[40vh] w-full flex-col items-center justify-center gap-2">
				<Box className="size-8 text-muted-foreground" />
				<span className="font-medium text-muted-foreground">
					{t("sandbox.emptyHint")}
				</span>
			</div>
		);
	}

	return (
		<div className="rounded-lg border overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{t("sandbox.colName")}</TableHead>
						<TableHead>{t("sandbox.colImage")}</TableHead>
						<TableHead>{t("sandbox.colStatus")}</TableHead>
						<TableHead>{t("sandbox.colCpuRam")}</TableHead>
						<TableHead>{t("sandbox.colExpires")}</TableHead>
						<TableHead>{t("sandbox.colCreated")}</TableHead>
						<TableHead className="text-right">
							{t("sandbox.colActions")}
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{sandboxes.map((sandbox) => (
						<TableRow key={sandbox.sandboxId}>
							<TableCell className="font-medium">
								<Link
									href={`/dashboard/sandboxes/${sandbox.sandboxId}`}
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
							<TableCell className="text-sm">
								{sandbox.cpu} vCPU / {sandbox.memoryMb} MB
							</TableCell>
							<TableCell className="text-sm text-muted-foreground">
								{formatExpiresIn(sandbox.expiresAt, sandbox.status, t)}
							</TableCell>
							<TableCell className="text-sm">
								<DateTooltip date={sandbox.createdAt} />
							</TableCell>
							<TableCell className="text-right">
								{sandbox.status === "running" &&
									permissions?.sandbox.create && (
										<DialogAction
											title={t("sandbox.killTitle")}
											description={t("sandbox.killDescription", {
												name: sandbox.name,
											})}
											onClick={async () => {
												await kill({ sandboxId: sandbox.sandboxId })
													.then(() => {
														toast.success(t("sandbox.killed"));
														utils.sandbox.list.invalidate();
													})
													.catch(() => toast.error(t("sandbox.killError")));
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
