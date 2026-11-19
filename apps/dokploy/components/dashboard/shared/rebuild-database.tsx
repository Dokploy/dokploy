import { AlertTriangle, DatabaseIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/utils/api";

interface Props {
	id: string;
	type: "libsql" | "mariadb" | "mongo" | "mysql" | "postgres" | "redis";
}

export const RebuildDatabase = ({ id, type }: Props) => {
	const { t } = useTranslation();
	const utils = api.useUtils();

	const mutationMap = {
		libsql: () => api.libsql.rebuild.useMutation(),
		mariadb: () => api.mariadb.rebuild.useMutation(),
		mongo: () => api.mongo.rebuild.useMutation(),
		mysql: () => api.mysql.rebuild.useMutation(),
		postgres: () => api.postgres.rebuild.useMutation(),
		redis: () => api.redis.rebuild.useMutation(),
	};

	const { mutateAsync, isPending } = mutationMap[type]();

	const handleRebuild = async () => {
		try {
			await mutateAsync({
				libsqlId: type === "libsql" ? id : "",
				mariadbId: type === "mariadb" ? id : "",
				mongoId: type === "mongo" ? id : "",
				mysqlId: type === "mysql" ? id : "",
				postgresId: type === "postgres" ? id : "",
				redisId: type === "redis" ? id : "",
			});
			toast.success(t("database.rebuildSuccess"));
			await utils.invalidate();
		} catch (error) {
			toast.error(t("database.rebuildError"), {
				description:
					error instanceof Error
						? error.message
						: t("database.rebuildUnknownError"),
			});
		}
	};

	return (
		<Card className="bg-background border-destructive/50">
			<CardHeader>
				<CardTitle className="text-xl flex items-center gap-2">
					<AlertTriangle className="h-5 w-5 text-destructive" />
					{t("database.dangerZone")}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<h3 className="text-base font-semibold">
							{t("database.rebuildDatabase")}
						</h3>
						<p className="text-sm text-muted-foreground">
							{t("database.rebuildWarning")}
						</p>
					</div>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								isLoading={isPending}
								variant="outline"
								className="w-full border-destructive/50 hover:bg-destructive/10 hover:text-destructive text-destructive"
							>
								<DatabaseIcon className="mr-2 h-4 w-4" />
								{t("database.rebuildDatabase")}
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle className="flex items-center gap-2">
									<AlertTriangle className="h-5 w-5 text-destructive" />
									{t("database.rebuildConfirmTitle")}
								</AlertDialogTitle>
								<AlertDialogDescription asChild>
									<div className="space-y-2">
										<p>{t("database.rebuildWill")}</p>
										<ul className="list-disc list-inside space-y-1">
											<li>{t("database.rebuildStepStop")}</li>
											<li>{t("database.rebuildStepDelete")}</li>
											<li>{t("database.rebuildStepReset")}</li>
											<li>{t("database.rebuildStepRestart")}</li>
										</ul>
										<p className="font-medium text-destructive mt-4">
											{t("database.rebuildIrreversible")}
										</p>
									</div>
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
								<AlertDialogAction
									onClick={handleRebuild}
									disabled={isPending}
									variant="destructive"
								>
									{t("database.rebuildConfirm")}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</CardContent>
		</Card>
	);
};
