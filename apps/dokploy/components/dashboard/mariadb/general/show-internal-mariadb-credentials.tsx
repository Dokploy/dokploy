import { ToggleVisibilityInput } from "@/components/shared/toggle-visibility-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";
import { useTranslation } from "next-i18next";

interface Props {
	mariadbId: string;
}
export const ShowInternalMariadbCredentials = ({ mariadbId }: Props) => {
	const { t } = useTranslation("dashboard");
	const { data } = api.mariadb.one.useQuery({ mariadbId });
	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">
							{t("dashboard.mariadb.internalCredentials")}
						</CardTitle>
					</CardHeader>
					<CardContent className="flex w-full flex-row gap-4">
						<div className="grid w-full md:grid-cols-2 gap-4 md:gap-8">
							<div className="flex flex-col gap-2">
								<Label>{t("dashboard.mariadb.user")}</Label>
								<Input disabled value={data?.databaseUser} />
							</div>
							<div className="flex flex-col gap-2">
								<Label>{t("dashboard.mariadb.databaseName")}</Label>
								<Input disabled value={data?.databaseName} />
							</div>
							<div className="flex flex-col gap-2">
								<Label>{t("dashboard.mariadb.password")}</Label>
								<div className="flex flex-row gap-4">
									<ToggleVisibilityInput
										disabled
										value={data?.databasePassword}
									/>
								</div>
							</div>
							<div className="flex flex-col gap-2">
								<Label>{t("dashboard.mariadb.rootPassword")}</Label>
								<div className="flex flex-row gap-4">
									<ToggleVisibilityInput
										disabled
										value={data?.databaseRootPassword}
									/>
								</div>
							</div>
							<div className="flex flex-col gap-2">
								<Label>{t("dashboard.mariadb.internalPort")}</Label>
								<Input disabled value="3306" />
							</div>

							<div className="flex flex-col gap-2">
								<Label>{t("dashboard.mariadb.internalHost")}</Label>
								<Input disabled value={data?.appName} />
							</div>

							<div className="flex flex-col gap-2 md:col-span-2">
								<Label>{t("dashboard.mariadb.internalConnectionUrl")}</Label>
								<ToggleVisibilityInput
									disabled
									value={`mariadb://${data?.databaseUser}:${data?.databasePassword}@${data?.appName}:3306/${data?.databaseName}`}
								/>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</>
	);
};
