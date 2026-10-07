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
		title: "Databases",
		description: "Postgres, MySQL, MongoDB, Redis and more, one click away.",
	},
	{
		icon: GlobeIcon,
		title: "Custom domains",
		description: "Attach your own domains and get automatic HTTPS.",
	},
	{
		icon: GitMergeIcon,
		title: "CI/CD",
		description: "Auto-deploy on every push from GitHub, GitLab or Bitbucket.",
	},
	{
		icon: UsersIcon,
		title: "Team collaboration",
		description: "Invite teammates with fine-grained permissions.",
	},
];

export const CompleteStep = ({ projectId, environmentId, onFinish }: Props) => {
	const router = useRouter();
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
					Done
				</span>
				<h1
					className={`${displayFont.className} text-4xl sm:text-5xl leading-[1.05] tracking-tight`}
				>
					You're all set.
				</h1>
				<p className="text-muted-foreground text-lg max-w-md leading-relaxed">
					This is just the beginning — here's some of what else you can do.
				</p>
			</div>

			<dl className="flex flex-col divide-y">
				{features.map((feature, index) => (
					<div key={feature.title} className="flex gap-6 py-5 first:pt-0">
						<dt className="font-mono text-xs text-muted-foreground pt-1 shrink-0 w-6">
							{String(index + 1).padStart(2, "0")}
						</dt>
						<dd className="flex flex-col gap-1">
							<span className="font-medium flex items-center gap-2">
								<feature.icon className="size-4 text-muted-foreground" />
								{feature.title}
							</span>
							<span className="text-sm text-muted-foreground">
								{feature.description}
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
					Go to my project
				</Button>
				<Button variant="ghost" asChild>
					<Link
						href="https://docs.dokploy.com/docs/core"
						target="_blank"
						className="flex items-center gap-1.5"
					>
						<BookIcon size={14} />
						Read the docs
					</Link>
				</Button>
			</div>
		</div>
	);
};
