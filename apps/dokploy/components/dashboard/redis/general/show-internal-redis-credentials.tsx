import { useTranslation } from "next-i18next";
import { ToggleVisibilityInput } from "@/components/shared/toggle-visibility-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";

interface Props {
	redisId: string;
}
export const ShowInternalRedisCredentials = ({ redisId }: Props) => {
	const { t } = useTranslation("common");
	const { data } = api.redis.one.useQuery({ redisId });
	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">
							{t("database.redis.internalCredentials.title")}
						</CardTitle>
					</CardHeader>
					<CardContent className="flex w-full flex-row gap-4">
						<div className="grid w-full md:grid-cols-2 gap-4 md:gap-8">
							<div className="flex flex-col gap-2">
								<Label>
									{t("database.redis.internalCredentials.userLabel")}
								</Label>
								<Input disabled value="default" />
							</div>
							<div className="flex flex-col gap-2">
								<Label>{t("auth.passwordLabel")}</Label>
								<div className="flex flex-row gap-4">
									<ToggleVisibilityInput
										value={data?.databasePassword}
										disabled
									/>
								</div>
							</div>
							<div className="flex flex-col gap-2">
								<Label>
									{t(
										"database.redis.internalCredentials.internalPortLabel",
									)}
								</Label>
								<Input disabled value="6379" />
							</div>

							<div className="flex flex-col gap-2">
								<Label>
									{t(
										"database.redis.internalCredentials.internalHostLabel",
									)}
								</Label>
								<Input disabled value={data?.appName} />
							</div>

							<div className="flex flex-col gap-2 md:col-span-2">
								<Label>
									{t(
										"database.redis.internalCredentials.internalConnectionUrlLabel",
									)}
								</Label>
								<ToggleVisibilityInput
									disabled
									value={`redis://default:${data?.databasePassword}@${data?.appName}:6379`}
								/>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</>
	);
};
