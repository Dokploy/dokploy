import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { TimeBadge } from "@/components/ui/time-badge";
import { api } from "@/utils/api";

interface BreadcrumbEntry {
	name: string;
	href?: string;
	dropdownItems?: {
		name: string;
		href: string;
	}[];
}

interface Props {
	list: BreadcrumbEntry[];
}

export const BreadcrumbSidebar = ({ list }: Props) => {
	const { data: isCloud } = api.settings.isCloud.useQuery();

	return (
		<header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
			<div className="flex items-center justify-between w-full gap-2 px-2 sm:px-4">
				<div className="flex min-w-0 flex-1 items-center gap-2">
					<SidebarTrigger className="shrink-0 sm:-ml-1" />
					<Separator orientation="vertical" className="mr-2 h-4 shrink-0" />
					<Breadcrumb className="min-w-0 flex-1">
						<BreadcrumbList className="flex-nowrap">
							{list.map((item, index) => (
								<Fragment key={`${item.name}-${index}`}>
									<BreadcrumbItem className="block min-w-0">
										{item.dropdownItems && item.dropdownItems.length > 0 ? (
											<DropdownMenu>
												<DropdownMenuTrigger className="flex items-center gap-1 hover:text-foreground transition-colors outline-none max-w-[12rem] truncate">
													<span className="truncate">{item.name}</span>
													<ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
												</DropdownMenuTrigger>
												<DropdownMenuContent align="start">
													{item.dropdownItems.map((subItem) => (
														<DropdownMenuItem key={subItem.href} asChild>
															<Link href={subItem.href}>{subItem.name}</Link>
														</DropdownMenuItem>
													))}
												</DropdownMenuContent>
											</DropdownMenu>
										) : (
											<BreadcrumbLink
												href={item?.href}
												asChild={!!item?.href}
												className="block max-w-[12rem] truncate"
											>
												{item.href ? (
													<Link href={item?.href}>{item?.name}</Link>
												) : (
													<BreadcrumbPage className="block max-w-[12rem] truncate">
														{item?.name}
													</BreadcrumbPage>
												)}
											</BreadcrumbLink>
										)}
									</BreadcrumbItem>
									{index + 1 < list.length && (
										<BreadcrumbSeparator className="block shrink-0" />
									)}
								</Fragment>
							))}
						</BreadcrumbList>
					</Breadcrumb>
				</div>
				{!isCloud && (
					<div className="hidden shrink-0 sm:block">
						<TimeBadge />
					</div>
				)}
			</div>
		</header>
	);
};
