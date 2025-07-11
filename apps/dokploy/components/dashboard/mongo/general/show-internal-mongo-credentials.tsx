import { ToggleVisibilityInput } from "@/components/shared/toggle-visibility-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";
import { useTranslation } from "next-i18next";

interface Props {
	mongoId: string;
}
export const ShowInternalMongoCredentials = ({ mongoId }: Props) => {
	const { t } = useTranslation("dashboard");
	const { data } = api.mongo.one.useQuery({ mongoId });
	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">
							{t("dashboard.mongo.internalCredentials")}
						</CardTitle>
					</CardHeader>
					<CardContent className="flex w-full flex-row gap-4">
						<div className="grid w-full md:grid-cols-2 gap-4 md:gap-8">
							<div className="flex flex-col gap-2">
								<Label>{t("dashboard.mongo.user")}</Label>
								<Input disabled value={data?.databaseUser} />
							</div>

							<div className="flex flex-col gap-2">
								<Label>{t("dashboard.mongo.password")}</Label>
								<div className="flex flex-row gap-4">
									<ToggleVisibilityInput
										disabled
										value={data?.databasePassword}
									/>
								</div>
							</div>

							<div className="flex flex-col gap-2">
								<Label>{t("dashboard.mongo.internalPort")}</Label>
								<Input disabled value="27017" />
							</div>

							<div className="flex flex-col gap-2">
								<Label>{t("dashboard.mongo.internalHost")}</Label>
								<Input disabled value={data?.appName} />
							</div>

							<div className="flex flex-col gap-2 md:col-span-2">
								<Label>{t("dashboard.mongo.internalConnectionUrl")}</Label>
								<ToggleVisibilityInput
									disabled
									value={`mongodb://${data?.databaseUser}:${data?.databasePassword}@${data?.appName}:27017`}
								/>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</>
	);
};
