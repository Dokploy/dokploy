import {
	BookIcon,
	DatabaseIcon,
	GitMergeIcon,
	GlobeIcon,
	UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import ConfettiExplosion from "react-confetti-explosion";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { displayFont } from "../font";

interface Props {
	projectId?: string;
	environmentId?: string;
	onFinish: () => void | Promise<void>;
}

const features = [
	{
		icon: DatabaseIcon,
		titleKey: "onboarding.complete.databasesTitle",
		descriptionKey: "onboarding.complete.databasesDescription",
	},
	{
		icon: GlobeIcon,
		titleKey: "onboarding.complete.domainsTitle",
		descriptionKey: "onboarding.complete.domainsDescription",
	},
	{
		icon: GitMergeIcon,
		titleKey: "onboarding.complete.cicdTitle",
		descriptionKey: "onboarding.complete.cicdDescription",
	},
	{
		icon: UsersIcon,
		titleKey: "onboarding.complete.teamTitle",
		descriptionKey: "onboarding.complete.teamDescription",
	},
];

export const CompleteStep = ({ projectId, environmentId, onFinish }: Props) => {
	const router = useRouter();
	const { t } = useTranslation();
	const [showConfetti, setShowConfetti] = useState(false);
	const [isFinishing, setIsFinishing] = useState(false);

	useEffect(() => {
		setShowConfetti(true);
	}, []);

	const projectHref =
		projectId && environmentId
			? `/dashboard/project/${projectId}/environment/${environmentId}`
			: "/dashboard/projects";

	const handleFinish = async () => {
		setIsFinishing(true);
		await onFinish();
		router.push(projectHref);
	};

	return (
		<div className="flex flex-col gap-10">
			<div className="fixed inset-x-0 top-0 flex justify-center pointer-events-none">
				{showConfetti && (
					<ConfettiExplosion
						duration={3000}
						force={0.35}
						particleCount={200}
						width={1200}
						zIndex={60}
					/>
				)}
			</div>

			<div className="flex flex-col gap-4">
				<span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
					{t("onboarding.complete.eyebrow")}
				</span>
				<h1
					className={`${displayFont.className} text-4xl sm:text-5xl leading-[1.05] tracking-tight`}
				>
					{t("onboarding.complete.title")}
				</h1>
				<p className="text-muted-foreground text-lg max-w-md leading-relaxed">
					{t("onboarding.complete.subtitle")}
				</p>
			</div>

			<dl className="flex flex-col divide-y">
				{features.map((feature, index) => (
					<div key={feature.titleKey} className="flex gap-6 py-5 first:pt-0">
						<dt className="font-mono text-xs text-muted-foreground pt-1 shrink-0 w-6">
							{String(index + 1).padStart(2, "0")}
						</dt>
						<dd className="flex flex-col gap-1">
							<span className="font-medium flex items-center gap-2">
								<feature.icon className="size-4 text-muted-foreground" />
								{t(feature.titleKey)}
							</span>
							<span className="text-sm text-muted-foreground">
								{t(feature.descriptionKey)}
							</span>
						</dd>
					</div>
				))}
			</dl>

			<div className="flex items-center gap-4">
				<Button
					size="lg"
					className="w-fit px-8"
					isLoading={isFinishing}
					onClick={handleFinish}
				>
					{t("onboarding.complete.goToProject")}
				</Button>
				<Button variant="ghost" asChild>
					<Link
						href="https://docs.dokploy.com/docs/core"
						target="_blank"
						className="flex items-center gap-1.5"
					>
						<BookIcon size={14} />
						{t("onboarding.complete.readDocs")}
					</Link>
				</Button>
			</div>
		</div>
	);
};
