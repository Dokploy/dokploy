import Link from "next/link";
import { Fragment } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface Props {
	list: {
		name: string;
		href: string;
	}[];
}

export const BreadcrumbSidebar = ({ list }: Props) => {
	return (
		<header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
			<div className="flex items-center justify-between w-full">
				<div className="flex items-center gap-2">
					<SidebarTrigger className="-ml-1" />
					<Separator orientation="vertical" className="mr-2 h-4" />
					<Breadcrumb>
						<BreadcrumbList>
							{list.map((item, index) => (
								<Fragment key={item.name}>
									<BreadcrumbItem className="block">
										<BreadcrumbLink href={item.href} asChild={!!item.href}>
											{item.href ? (
												<Link href={item.href}>{item.name}</Link>
											) : (
												item.name
											)}
										</BreadcrumbLink>
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
