import { AlertTriangle, DatabaseIcon } from "lucide-react";
import { useTranslation } from "next-i18next";
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
	type: "postgres" | "mysql" | "mariadb" | "mongo" | "redis";
}

export const RebuildDatabase = ({ id, type }: Props) => {
	const { t } = useTranslation("common");
	const utils = api.useUtils();

	const mutationMap = {
		postgres: () => api.postgres.rebuild.useMutation(),
		mysql: () => api.mysql.rebuild.useMutation(),
		mariadb: () => api.mariadb.rebuild.useMutation(),
		mongo: () => api.mongo.rebuild.useMutation(),
		redis: () => api.redis.rebuild.useMutation(),
	};

	const { mutateAsync, isLoading } = mutationMap[type]();

	const handleRebuild = async () => {
		try {
			await mutateAsync({
				postgresId: type === "postgres" ? id : "",
				mysqlId: type === "mysql" ? id : "",
				mariadbId: type === "mariadb" ? id : "",
				mongoId: type === "mongo" ? id : "",
				redisId: type === "redis" ? id : "",
			});
			toast.success(t("database.rebuild.success"));
			await utils.invalidate();
		} catch (error) {
			toast.error(t("database.rebuild.error"), {
				description:
					error instanceof Error
							? error.message
							: t("common.unknownError"),
			});
		}
	};

	return (
		<Card className="bg-background border-destructive/50">
			<CardHeader>
				<CardTitle className="text-xl flex items-center gap-2">
					<AlertTriangle className="h-5 w-5 text-destructive" />
					{t("database.rebuild.dangerZone.title")}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<h3 className="text-base font-semibold">
							{t("database.rebuild.title")}
						</h3>
						<p className="text-sm text-muted-foreground">
							{t("database.rebuild.description")}
						</p>
					</div>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								isLoading={isLoading}
								variant="outline"
								className="w-full border-destructive/50 hover:bg-destructive/10 hover:text-destructive text-destructive"
							>
								<DatabaseIcon className="mr-2 h-4 w-4" />
								{t("database.rebuild.button")}
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle className="flex items-center gap-2">
									<AlertTriangle className="h-5 w-5 text-destructive" />
									{t("database.rebuild.confirmTitle")}
								</AlertDialogTitle>
								<AlertDialogDescription className="space-y-2">
									<p>{t("database.rebuild.confirmIntro")}</p>
									<ul className="list-disc list-inside space-y-1">
										<li>{t("database.rebuild.steps.stopService")}</li>
										<li>{t("database.rebuild.steps.deleteData")}</li>
										<li>{t("database.rebuild.steps.resetConfig")}</li>
										<li>{t("database.rebuild.steps.restartService")}</li>
									</ul>
									<p className="font-medium text-destructive mt-4">
										{t("common.actionCannotBeUndone")}
									</p>
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>{t("button.cancel")}</AlertDialogCancel>
								<AlertDialogAction
									onClick={handleRebuild}
									className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
									asChild
								>
									<Button isLoading={isLoading} type="submit">
										{t("database.rebuild.confirmButton")}
									</Button>
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</CardContent>
		</Card>
	);
};
