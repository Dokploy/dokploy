import { AlertTriangle, DatabaseIcon } from "lucide-react";
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
			toast.success("Database rebuilt successfully");
			await utils.invalidate();
		} catch (error) {
			toast.error("Error rebuilding database", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		}
	};

	return (
		<Card className="bg-background border-destructive/50">
			<CardHeader>
				<CardTitle className="text-xl flex items-center gap-2">
					<AlertTriangle className="h-5 w-5 text-destructive" />
					Danger Zone
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<h3 className="text-base font-semibold">Rebuild Database</h3>
						<p className="text-sm text-muted-foreground">
							This action will completely reset your database to its initial
							state. All data, tables, and configurations will be removed.
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
								Rebuild Database
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle className="flex items-center gap-2">
									<AlertTriangle className="h-5 w-5 text-destructive" />
									Are you absolutely sure?
								</AlertDialogTitle>
								<AlertDialogDescription className="space-y-2">
									<p>This action will:</p>
									<ul className="list-disc list-inside space-y-1">
										<li>Stop the current database service</li>
										<li>Delete all existing data and volumes</li>
										<li>Reset to the default configuration</li>
										<li>Restart the service with a clean state</li>
									</ul>
									<p className="font-medium text-destructive mt-4">
										This action cannot be undone.
									</p>
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction
									onClick={handleRebuild}
									className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
									asChild
								>
									<Button isLoading={isLoading} type="submit">
										Yes, rebuild database
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
