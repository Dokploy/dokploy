import { GitBranchIcon, PuzzleIcon, ServerIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { displayFont } from "../font";

interface Props {
	onNext: () => void;
}

const points = [
	{
		icon: GitBranchIcon,
		titleKey: "onboarding.welcome.gitDockerTitle",
		descriptionKey: "onboarding.welcome.gitDockerDescription",
	},
	{
		icon: PuzzleIcon,
		titleKey: "onboarding.welcome.templatesTitle",
		descriptionKey: "onboarding.welcome.templatesDescription",
	},
	{
		icon: ServerIcon,
		titleKey: "onboarding.welcome.serversTitle",
		descriptionKey: "onboarding.welcome.serversDescription",
	},
];

export const WelcomeStep = ({ onNext }: Props) => {
	const { t } = useTranslation();
	return (
		<div className="flex flex-col gap-12">
			<div className="flex flex-col gap-4">
				<span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
					{t("onboarding.welcome.eyebrow")}
				</span>
				<h1
					className={`${displayFont.className} text-4xl sm:text-5xl leading-[1.05] tracking-tight`}
				>
					{t("onboarding.welcome.titlePlain")}{" "}
					<em className="not-italic">{t("onboarding.welcome.titleAccent")}</em>.
				</h1>
				<p className="text-muted-foreground text-lg max-w-md leading-relaxed">
					{t("onboarding.welcome.subtitle")}
				</p>
			</div>

			<dl className="flex flex-col divide-y">
				{points.map((point, index) => (
					<div key={point.titleKey} className="flex gap-6 py-5 first:pt-0">
						<dt className="font-mono text-xs text-muted-foreground pt-1 shrink-0 w-6">
							{String(index + 1).padStart(2, "0")}
						</dt>
						<dd className="flex flex-col gap-1">
							<span className="font-medium flex items-center gap-2">
								<point.icon className="size-4 text-muted-foreground" />
								{t(point.titleKey)}
							</span>
							<span className="text-sm text-muted-foreground">
								{t(point.descriptionKey)}
							</span>
						</dd>
					</div>
				))}
			</dl>

			<Button size="lg" onClick={onNext} className="w-fit px-8">
				{t("onboarding.welcome.getStarted")}
			</Button>
		</div>
	);
};
