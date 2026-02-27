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
	console.log(list);
	return (
		<header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
			<div className="flex items-center justify-between w-full">
				<div className="flex items-center gap-2">
					<SidebarTrigger className="-ml-1" />
					<Separator orientation="vertical" className="mr-2 h-4" />
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
			</div>
		</header>
	);
};
