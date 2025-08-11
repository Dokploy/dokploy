import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { Split, Trash2 } from "lucide-react";
import { useTranslation } from "next-i18next";
import { toast } from "sonner";
import { HandleRedirect } from "./handle-redirect";

interface Props {
	applicationId: string;
}

export const ShowRedirects = ({ applicationId }: Props) => {
	const { t } = useTranslation("dashboard");
	const { data, refetch } = api.application.one.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);

	const { mutateAsync: deleteRedirect, isLoading: isRemoving } =
		api.redirects.delete.useMutation();

	const utils = api.useUtils();

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between flex-wrap gap-4">
				<div>
					<CardTitle className="text-xl">
						{t("dashboard.redirects.redirects")}
					</CardTitle>
					<CardDescription>
						{t("dashboard.redirects.description")}
					</CardDescription>
				</div>

				{data && data?.redirects.length > 0 && (
					<HandleRedirect applicationId={applicationId}>
						{t("dashboard.redirects.addRedirect")}
					</HandleRedirect>
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{data?.redirects.length === 0 ? (
					<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
						<Split className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							{t("dashboard.redirects.noRedirectsConfigured")}
						</span>
						<HandleRedirect applicationId={applicationId}>
							{t("dashboard.redirects.addRedirect")}
						</HandleRedirect>
					</div>
				) : (
					<div className="flex flex-col pt-2">
						<div className="flex flex-col gap-6">
							{data?.redirects.map((redirect) => (
								<div key={redirect.redirectId}>
									<div className="flex w-full flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-10 border rounded-lg p-4">
										<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 flex-col gap-4 sm:gap-8">
											<div className="flex flex-col gap-1">
												<span className="font-medium">
													{t("dashboard.redirects.regex")}
												</span>
												<span className="text-sm text-muted-foreground">
													{redirect.regex}
												</span>
											</div>
											<div className="flex flex-col gap-1">
												<span className="font-medium">
													{t("dashboard.redirects.replacement")}
												</span>
												<span className="text-sm text-muted-foreground">
													{redirect.replacement}
												</span>
											</div>
											<div className="flex flex-col gap-1">
												<span className="font-medium">
													{t("dashboard.redirects.permanent")}
												</span>
												<span className="text-sm text-muted-foreground">
													{redirect.permanent
														? t("dashboard.redirects.yes")
														: t("dashboard.redirects.no")}
												</span>
											</div>
										</div>
										<div className="flex flex-row gap-4">
											<HandleRedirect
												redirectId={redirect.redirectId}
												applicationId={applicationId}
											/>

											<DialogAction
												title={t("dashboard.redirects.deleteRedirect")}
												description={t(
													"dashboard.redirects.deleteRedirectConfirmation",
												)}
												type="destructive"
												onClick={async () => {
													await deleteRedirect({
														redirectId: redirect.redirectId,
													})
														.then(() => {
															refetch();
															utils.application.readTraefikConfig.invalidate({
																applicationId,
															});
															toast.success(
																t(
																	"dashboard.redirects.redirectDeletedSuccessfully",
																),
															);
														})
														.catch(() => {
															toast.error(
																t("dashboard.redirects.errorDeletingRedirect"),
															);
														});
												}}
											>
												<Button
													variant="ghost"
													size="icon"
													className="group hover:bg-red-500/10"
													isLoading={isRemoving}
												>
													<Trash2 className="size-4 text-primary group-hover:text-red-500" />
												</Button>
											</DialogAction>
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
};
