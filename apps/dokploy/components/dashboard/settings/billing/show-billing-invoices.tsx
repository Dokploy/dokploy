import { CreditCard, FileText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { cn } from "@/lib/utils";
import { ShowInvoices } from "./show-invoices";

const navigationItems = [
	{
		name: "Subscription",
		href: "/dashboard/settings/billing",
		icon: CreditCard,
	},
	{
		name: "Invoices",
		href: "/dashboard/settings/invoices",
		icon: FileText,
	},
];

export const ShowBillingInvoices = () => {
	const router = useRouter();

	return (
		<div className="w-full">
			<div>
				<div>
					<h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
						<CreditCard className="size-5 text-muted-foreground" />
						Billing
					</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Manage your subscription and invoices
					</p>
					<div className="space-y-4 pt-6">
						<nav className="flex space-x-2 border-b">
							{navigationItems.map((item) => {
								const Icon = item.icon;
								const isActive = router.pathname === item.href;
								return (
									<Link
										key={item.name}
										href={item.href}
										className={cn(
											"flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors",
											isActive
												? "border-primary text-primary"
												: "border-transparent text-muted-foreground hover:text-primary hover:border-muted",
										)}
									>
										<Icon className="h-4 w-4" />
										{item.name}
									</Link>
								);
							})}
						</nav>

						<div className="mt-6">
							<ShowInvoices />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};
