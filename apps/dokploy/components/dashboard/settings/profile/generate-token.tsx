import { ToggleVisibilityInput } from "@/components/shared/toggle-visibility-input";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useTranslation } from "next-i18next";
import { api } from "@/utils/api";
import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export const GenerateToken = () => {
	const { t } = useTranslation("settings");
	const { data, refetch } = api.auth.get.useQuery();

	const { mutateAsync: generateToken, isLoading: isLoadingToken } =
		api.auth.generateToken.useMutation();

	return (
		<Card className="bg-transparent">
			<CardHeader className="flex flex-row gap-2 flex-wrap justify-between items-center">
				<div>
					<CardTitle className="text-xl">
						{t("settings.profile.api.cli.title")}
					</CardTitle>
					<CardDescription>
						{t("settings.profile.api.cli.description")}
					</CardDescription>
				</div>
				<div className="flex flex-row gap-2 max-sm:flex-wrap items-end">
					<span className="text-sm font-medium text-muted-foreground">
						{t("settings.profile.api.swagger.title")}:
					</span>
					<Link
						href="/swagger"
						target="_blank"
						className="flex flex-row gap-2 items-center"
					>
						<span className="text-sm font-medium">
							{t("settings.profile.api.swagger.view")}
						</span>
						<ExternalLinkIcon className="size-4" />
					</Link>
				</div>
			</CardHeader>
			<CardContent className="space-y-2">
				<div className="flex flex-row gap-2 max-sm:flex-wrap justify-end items-end">
					<div className="grid w-full gap-8">
						<div className="flex flex-col gap-2">
							<Label>{t("settings.profile.api.cli.token")}</Label>
							<ToggleVisibilityInput
								placeholder="Token"
								value={data?.token || ""}
								disabled
							/>
						</div>
					</div>
					<Button
						type="button"
						isLoading={isLoadingToken}
						onClick={async () => {
							await generateToken().then(() => {
								refetch();
								toast.success(t("settings.profile.api.cli.tokenGenerated"));
							});
						}}
					>
						{t("settings.profile.api.cli.generate")}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
};
