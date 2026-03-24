import { AlertTriangle, DatabaseIcon } from "lucide-react";
import { useTranslations } from "next-intl";
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
	const t = useTranslations("rebuildDatabase");
	const utils = api.useUtils();

	const mutationMap = {
		postgres: () => api.postgres.rebuild.useMutation(),
		mysql: () => api.mysql.rebuild.useMutation(),
		mariadb: () => api.mariadb.rebuild.useMutation(),
		mongo: () => api.mongo.rebuild.useMutation(),
		redis: () => api.redis.rebuild.useMutation(),
	};

	const { mutateAsync, isPending } = mutationMap[type]();

	const handleRebuild = async () => {
		try {
			await mutateAsync({
				postgresId: type === "postgres" ? id : "",
				mysqlId: type === "mysql" ? id : "",
				mariadbId: type === "mariadb" ? id : "",
				mongoId: type === "mongo" ? id : "",
				redisId: type === "redis" ? id : "",
			});
			toast.success(t("toastSuccess"));
			await utils.invalidate();
		} catch (error) {
			toast.error(t("toastError"), {
				description:
					error instanceof Error ? error.message : t("unknownError"),
			});
		}
	};

	return (
		<Card className="bg-background border-destructive/50">
			<CardHeader>
				<CardTitle className="text-xl flex items-center gap-2">
					<AlertTriangle className="h-5 w-5 text-destructive" />
					{t("dangerZone")}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<h3 className="text-base font-semibold">{t("title")}</h3>
						<p className="text-sm text-muted-foreground">{t("description")}</p>
					</div>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								isLoading={isPending}
								variant="outline"
								className="w-full border-destructive/50 hover:bg-destructive/10 hover:text-destructive text-destructive"
							>
								<DatabaseIcon className="mr-2 h-4 w-4" />
								{t("button")}
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle className="flex items-center gap-2">
									<AlertTriangle className="h-5 w-5 text-destructive" />
									{t("confirmTitle")}
								</AlertDialogTitle>
								<AlertDialogDescription className="space-y-2">
									<p>{t("confirmIntro")}</p>
									<ul className="list-disc list-inside space-y-1">
										<li>{t("bulletStop")}</li>
										<li>{t("bulletDelete")}</li>
										<li>{t("bulletReset")}</li>
										<li>{t("bulletRestart")}</li>
									</ul>
									<p className="font-medium text-destructive mt-4">
										{t("cannotUndo")}
									</p>
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
								<AlertDialogAction
									onClick={handleRebuild}
									className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
									asChild
								>
									<Button isLoading={isPending} type="submit">
										{t("confirm")}
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
