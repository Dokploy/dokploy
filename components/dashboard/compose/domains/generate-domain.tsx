import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";
import { RefreshCcw } from "lucide-react";
import Link from "next/link";
import { GenerateTraefikMe } from "./generate-traefikme";
import { GenerateWildCard } from "./generate-wildcard";

interface Props {
	composeId: string;
}

export const GenerateDomainCompose = ({ composeId }: Props) => {
	return (
		<Dialog>
			<DialogTrigger className="" asChild>
				<Button variant="secondary">
					Generate Domain
					<RefreshCcw className="size-4  text-muted-foreground " />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Generate Domain</DialogTitle>
					<DialogDescription>
						Generate Domains for your compose services
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4 w-full">
					<ul className="flex flex-col gap-4">
						<li className="flex flex-row items-center gap-4">
							<div className="flex flex-col gap-2">
								<div className="text-base font-bold">
									1. Generate TraefikMe Domain
								</div>
								<div className="text-sm text-muted-foreground">
									This option generates a free domain provided by{" "}
									<Link
										href="https://traefik.me"
										className="text-primary"
										target="_blank"
									>
										TraefikMe
									</Link>
									. We recommend using this for quick domain testing or if you
									don't have a domain yet.
								</div>
							</div>
						</li>
						{/* <li className="flex flex-row items-center gap-4">
							<div className="flex flex-col gap-2">
								<div className="text-base font-bold">
									2. Use Wildcard Domain
								</div>
								<div className="text-sm text-muted-foreground">
									To use this option, you need to set up an 'A' record in your
									domain provider. For example, create a record for
									*.yourdomain.com.
								</div>
							</div>
						</li> */}
					</ul>
					<div className="flex flex-row gap-4 w-full">
						<GenerateTraefikMe composeId={composeId} />
						{/* <GenerateWildCard composeId={composeId} /> */}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
