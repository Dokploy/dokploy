import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
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

export const ShowInvoices = () => {
	const isPending = false;
	const invoices: Array<{
		id: string;
		number?: string | null;
		created?: number | null;
		dueDate?: number | null;
		amountDue?: number | null;
		currency?: string | null;
		status?: string | null;
		hostedInvoiceUrl?: string | null;
		invoicePdf?: string | null;
	}> = [];

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
									<TableCell>-</TableCell>
									<TableCell>-</TableCell>
									<TableCell>
										-
									</TableCell>
									<TableCell>
										<Badge variant="secondary">-</Badge>
									</TableCell>
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
					<p className="text-base text-muted-foreground">
						Инвойсы Stripe отключены
					</p>
					<p className="text-sm text-muted-foreground">
						История платежей будет доступна в новом биллинге.
					</p>
				</div>
			)}
		</div>
	);
};
