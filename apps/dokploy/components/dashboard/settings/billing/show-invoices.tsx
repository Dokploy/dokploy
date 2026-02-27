import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import type Stripe from "stripe";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
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
	const { data: invoices, isPending } = api.stripe.getInvoices.useQuery();

	return (
		<div className="space-y-4">
			{isPending ? (
				<div className="flex items-center justify-center min-h-[20vh]">
					<span className="text-base text-muted-foreground flex flex-row gap-3 items-center">
						Loading invoices...
						<Loader2 className="animate-spin" />
					</span>
				</div>
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
				<div className="flex flex-col items-center justify-center min-h-[20vh] gap-2">
					<FileText className="size-12 text-muted-foreground" />
					<p className="text-base text-muted-foreground">No invoices found</p>
					<p className="text-sm text-muted-foreground">
						Your invoices will appear here once you have a subscription
					</p>
				</div>
			)}
		</div>
	);
};
