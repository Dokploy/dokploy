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
import { NotificationBell } from "@/components/layouts/notification-bell";
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
		<header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b bg-background/90 backdrop-blur px-4 -mx-4 mb-6">
				<SidebarTrigger className="-ml-1" />
				<Separator orientation="vertical" className="mr-2 h-4" />
				<div className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-sm flex-1">
					<Breadcrumb>
						<BreadcrumbList>
							{list.map((item, index) => (
								<Fragment key={`${item.name}-${index}`}>
									<BreadcrumbItem className="block">
										{item.dropdownItems && item.dropdownItems.length > 0 ? (
											<DropdownMenu>
												<DropdownMenuTrigger className="flex items-center gap-1 hover:text-foreground transition-colors outline-none">
													{item.name}
													<ChevronDown className="h-4 w-4 opacity-50" />
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
											<BreadcrumbLink href={item?.href} asChild={!!item?.href}>
												{item.href ? (
													<Link href={item?.href}>{item?.name}</Link>
												) : (
													<BreadcrumbPage>{item?.name}</BreadcrumbPage>
												)}
											</BreadcrumbLink>
										)}
									</BreadcrumbItem>
									{index + 1 < list.length && (
										<BreadcrumbSeparator className="block" />
									)}
								</Fragment>
							))}
						</BreadcrumbList>
					</Breadcrumb>
				</div>
				<div className="ml-auto flex items-center gap-2">
					{!isCloud && <TimeBadge />}
					<NotificationBell />
				</div>
		</header>
	);
};
