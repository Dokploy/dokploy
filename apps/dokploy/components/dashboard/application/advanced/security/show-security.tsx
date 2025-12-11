import { LockKeyhole, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "next-i18next";
import { DialogAction } from "@/components/shared/dialog-action";
import { ToggleVisibilityInput } from "@/components/shared/toggle-visibility-input";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";
import { HandleSecurity } from "./handle-security";

interface Props {
	applicationId: string;
}

export const ShowSecurity = ({ applicationId }: Props) => {
	const { t } = useTranslation("common");
	const { data, refetch } = api.application.one.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);

	const { mutateAsync: deleteSecurity, isLoading: isRemoving } =
		api.security.delete.useMutation();

	const utils = api.useUtils();
	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between flex-wrap gap-4">
				<div>
					<CardTitle className="text-xl">
						{t("security.card.title")}
					</CardTitle>
					<CardDescription>
						{t("security.card.description")}
					</CardDescription>
				</div>

				{data && data?.security.length > 0 && (
					<HandleSecurity applicationId={applicationId}>
						{t("security.button.add")}
					</HandleSecurity>
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{data?.security.length === 0 ? (
					<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
						<LockKeyhole className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							{t("security.empty.description")}
						</span>
						<HandleSecurity applicationId={applicationId}>
							{t("security.button.add")}
						</HandleSecurity>
					</div>
				) : (
					<div className="flex flex-col pt-2">
						<div className="flex flex-col gap-6 ">
							{data?.security.map((security) => (
								<div key={security.securityId}>
									<div className="flex w-full flex-col md:flex-row justify-between md:items-center gap-4 md:gap-10 border rounded-lg p-4">
										<div className="grid grid-cols-1 md:grid-cols-2 flex-col gap-4 md:gap-8">
											<div className="flex flex-col gap-2">
												<Label>{t("security.list.username")}</Label>
												<Input disabled value={security.username} />
											</div>
											<div className="flex flex-col gap-2">
												<Label>{t("security.list.password")}</Label>
												<ToggleVisibilityInput
													value={security.password}
													disabled
												/>
											</div>
										</div>
										<div className="flex flex-row gap-2">
											<HandleSecurity
												securityId={security.securityId}
												applicationId={applicationId}
											/>
											<DialogAction
												title={t("security.dialog.delete.title")}
												description={t("security.dialog.delete.description")}
												type="destructive"
												onClick={async () => {
													await deleteSecurity({
														securityId: security.securityId,
													})
														.then(() => {
															refetch();
															utils.application.readTraefikConfig.invalidate({
																applicationId,
															});
															toast.success(t("security.toast.deleteSuccess"));
														})
														.catch(() => {
															toast.error(t("security.toast.deleteError"));
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
