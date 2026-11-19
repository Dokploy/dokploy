import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ScreenHeading } from "./screen-heading";
import { ServerPathCards } from "./server-path-cards";

interface Props {
	onHaveServer: () => void;
	onNeedServer: () => void;
	onSkip: () => void;
	onPayNow: () => void;
	canStartTrial: boolean;
}

export const PathScreen = ({
	onHaveServer,
	onNeedServer,
	onSkip,
	onPayNow,
	canStartTrial,
}: Props) => {
	const { t } = useTranslation();
	return (
		<section className="flex flex-col gap-10">
			<ScreenHeading
				eyebrow={t("onboarding.cloud.pathEyebrow")}
				title={
					<>
						{t("onboarding.cloud.pathTitlePlain")}{" "}
						<em className="not-italic">
							{t("onboarding.cloud.pathTitleAccent")}
						</em>
						?
					</>
				}
			>
				{t("onboarding.cloud.pathSubtitle")}
			</ScreenHeading>
			<ServerPathCards
				onHaveServer={onHaveServer}
				onNeedServer={onNeedServer}
			/>
			<div className="flex flex-col gap-6 border-t pt-6">
				<div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
					<Button variant="outline" className="shrink-0" onClick={onSkip}>
						{t("onboarding.cloud.lookAroundFirst")}
					</Button>
					<p className="text-sm text-muted-foreground">
						{t(
							canStartTrial
								? "onboarding.cloud.exploreHintTrial"
								: "onboarding.cloud.exploreHint",
						)}
					</p>
				</div>
				{canStartTrial && (
					<p className="text-sm text-muted-foreground">
						{t("onboarding.cloud.alreadyDecided")}{" "}
						<button
							type="button"
							onClick={onPayNow}
							className="font-medium text-foreground underline underline-offset-4"
						>
							{t("onboarding.cloud.payNowSkipTrial")}
						</button>
					</p>
				)}
			</div>
		</section>
	);
};
