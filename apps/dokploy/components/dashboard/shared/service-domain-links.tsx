import { ExternalLinkIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Badge } from "@/components/ui/badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";

interface ServiceDomainLinksProps {
	id: string;
	type: "application" | "compose";
	maxVisible?: number;
}

const isTraefikDomain = (host: string): boolean => {
	return host.endsWith(".traefik.me");
};

const truncateDomain = (host: string, maxLength: number = 30): string => {
	if (host.length <= maxLength) return host;
	return `${host.substring(0, maxLength - 3)}...`;
};

const getDomainLabel = (
	domain: {
		host: string;
		serviceName?: string | null;
	},
	type: "application" | "compose",
): string => {
	// Always return the full hostname
	return domain.host;
};

export const ServiceDomainLinks = ({
	id,
	type,
	maxVisible = 3,
}: ServiceDomainLinksProps) => {
	const router = useRouter();
	const [isOverflowOpen, setIsOverflowOpen] = useState(false);
	const [responsiveMaxVisible, setResponsiveMaxVisible] = useState(maxVisible);

	// Adjust maxVisible based on screen size
	useEffect(() => {
		const updateMaxVisible = () => {
			if (typeof window !== "undefined") {
				const width = window.innerWidth;
				// Mobile (< 640px): 1, Tablet (640-1024px): 2, Desktop (> 1024px): maxVisible
				if (width < 640) {
					setResponsiveMaxVisible(1);
				} else if (width < 1024) {
					setResponsiveMaxVisible(2);
				} else {
					setResponsiveMaxVisible(maxVisible);
				}
			}
		};

		updateMaxVisible();
		window.addEventListener("resize", updateMaxVisible);
		return () => window.removeEventListener("resize", updateMaxVisible);
	}, [maxVisible]);

	const {
		data: domains,
		isLoading,
	} = type === "application"
		? api.domain.byApplicationId.useQuery(
				{
					applicationId: id,
				},
				{
					enabled: !!id,
				},
			)
		: api.domain.byComposeId.useQuery(
				{
					composeId: id,
				},
				{
					enabled: !!id,
				},
			);

	// Get service data for navigation
	const { data: service } =
		type === "application"
			? api.application.one.useQuery(
					{
						applicationId: id,
					},
					{
						enabled: !!id,
					},
				)
			: api.compose.one.useQuery(
					{
						composeId: id,
					},
					{
						enabled: !!id,
					},
				);

	// Process and prioritize domains
	const allDomains = useMemo(() => {
		if (!domains || domains.length === 0) return [];

		const processedDomains = domains
			.filter((domain) => domain && domain.host)
			.map((domain) => ({
				label: getDomainLabel(domain, type),
				url: `${domain.https ? "https" : "http"}://${domain.host}${domain.path || "/"}`,
				domainId: domain.domainId,
				host: domain.host,
				isTraefik: isTraefikDomain(domain.host),
			}));

		// Prioritize: custom domains first, then Traefik domains
		return processedDomains.sort((a, b) => {
			if (a.isTraefik && !b.isTraefik) return 1;
			if (!a.isTraefik && b.isTraefik) return -1;
			return 0;
		});
	}, [domains, type]);

	const visibleDomains = allDomains.slice(0, responsiveMaxVisible);
	const overflowDomains = allDomains.slice(responsiveMaxVisible);

	if (isLoading) {
		return null;
	}

	if (allDomains.length === 0) {
		return null;
	}

	const handleAddDomain = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (service) {
			const projectId = service.environment?.projectId;
			const environmentId = service.environmentId;
			if (projectId && environmentId) {
				router.push(
					`/dashboard/project/${projectId}/environment/${environmentId}/services/${type}/${id}?tab=domains`,
				);
			}
		}
	};

	return (
		<div className="flex items-center gap-1.5 flex-wrap min-w-0 w-full">
			{visibleDomains.map((domain) => (
				<Link
					key={domain.domainId}
					href={domain.url}
					target="_blank"
					rel="noopener noreferrer"
					className="group shrink-0"
				>
					<Badge
						variant="outline"
						className="cursor-pointer hover:bg-primary/10 transition-colors gap-1.5 px-2 py-0.5 text-xs max-w-full"
					>
						<span className="truncate max-w-[200px] sm:max-w-none">{domain.label}</span>
						<ExternalLinkIcon className="size-3 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" />
					</Badge>
				</Link>
			))}

			{/* Always show menu if there are domains (for "Add Domain" access) or if there's overflow */}
			{(overflowDomains.length > 0 || allDomains.length > 0) && (
				<DropdownMenu open={isOverflowOpen} onOpenChange={setIsOverflowOpen}>
					<DropdownMenuTrigger asChild>
						<button className="shrink-0">
							<Badge
								variant="outline"
								className="cursor-pointer hover:bg-primary/10 transition-colors gap-1.5 px-2 py-0.5 text-xs"
							>
								{overflowDomains.length > 0
									? `+${overflowDomains.length}`
									: "⋯"}
							</Badge>
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-[220px] space-y-1 overflow-y-auto max-h-[400px]"
						align="end"
					>
						<DropdownMenuLabel className="text-xs font-semibold">
							Domains
						</DropdownMenuLabel>
						<DropdownMenuSeparator />

						{/* Show all domains in menu */}
						{allDomains.map((domain) => (
							<DropdownMenuItem key={domain.domainId} asChild>
								<Link
									href={domain.url}
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center justify-between gap-2 text-xs cursor-pointer"
									onClick={(e) => {
										setIsOverflowOpen(false);
									}}
								>
									<span className="whitespace-nowrap flex-1">{domain.label}</span>
									<ExternalLinkIcon className="size-3 shrink-0" />
								</Link>
							</DropdownMenuItem>
						))}

						{/* Add domain shortcut */}
						{service && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										setIsOverflowOpen(false);
										handleAddDomain(e);
									}}
									className="text-xs cursor-pointer"
								>
									<PlusIcon className="size-3 mr-2" />
									Add Domain
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	);
};

