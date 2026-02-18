import { Download, ExternalLink, FileText } from "lucide-react";
import type Stripe from "stripe";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/shared/list-skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { api } from "@/utils/api";

const formatDate = (timestamp: number | null) => {
	if (!timestamp) return "-";
	return new Date(timestamp * 1000).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
};

const formatAmount = (amount: number, currency: string) => {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amount / 100);
};

const getStatusBadge = (status: Stripe.Invoice.Status | null) => {
	const statusConfig: Record<
		Stripe.Invoice.Status,
		{ label: string; variant: "default" | "secondary" | "destructive" }
	> = {
		paid: { label: "Paid", variant: "default" },
		open: { label: "Open", variant: "secondary" },
		draft: { label: "Draft", variant: "secondary" },
		void: { label: "Void", variant: "destructive" },
		uncollectible: { label: "Uncollectible", variant: "destructive" },
	};

	if (!status) {
		return <Badge variant="secondary">Unknown</Badge>;
	}

	const config = statusConfig[status] || {
		label: status,
		variant: "secondary" as const,
	};

	return <Badge variant={config.variant}>{config.label}</Badge>;
};

export const ShowInvoices = () => {
	const { data: invoices, isLoading } = api.stripe.getInvoices.useQuery();

	return (
		<div className="space-y-4">
			{isLoading ? (
				<ListSkeleton items={4} gridClassName="grid grid-cols-1 gap-3" />
			) : invoices && invoices.length > 0 ? (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Invoice</TableHead>
								<TableHead>Date</TableHead>
								<TableHead>Due Date</TableHead>
								<TableHead>Amount</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{invoices.map((invoice) => (
								<TableRow key={invoice.id}>
									<TableCell className="font-medium">
										{invoice.number || invoice.id.slice(0, 12)}
									</TableCell>
									<TableCell>{formatDate(invoice.created)}</TableCell>
									<TableCell>{formatDate(invoice.dueDate)}</TableCell>
									<TableCell>
										{formatAmount(invoice.amountDue, invoice.currency)}
									</TableCell>
									<TableCell>{getStatusBadge(invoice.status)}</TableCell>
									<TableCell className="text-right">
										<div className="flex justify-end gap-2">
											{invoice.hostedInvoiceUrl && (
												<Button
													variant="outline"
													size="sm"
													onClick={() =>
														window.open(
															invoice.hostedInvoiceUrl || "",
															"_blank",
														)
													}
												>
													<ExternalLink className="h-4 w-4" />
												</Button>
											)}
											{invoice.invoicePdf && (
												<Button
													variant="outline"
													size="sm"
													onClick={() =>
														window.open(invoice.invoicePdf || "", "_blank")
													}
												>
													<Download className="h-4 w-4" />
												</Button>
											)}
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			) : (
				<Empty className="min-h-[20vh]">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<FileText className="size-6 text-muted-foreground" />
						</EmptyMedia>
						<EmptyTitle>No invoices yet</EmptyTitle>
						<EmptyDescription>
							Your invoices will appear here once you have a subscription.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</div>
	);
};
