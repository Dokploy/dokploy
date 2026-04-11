import InvoiceNotificationEmail from "@dokploy/server/emails/emails/invoice-notification";
import PaymentFailedEmail from "@dokploy/server/emails/emails/payment-failed";
import { sendEmail } from "@dokploy/server/verification/send-verification-email";
import { renderAsync } from "@react-email/components";
import { format } from "date-fns";
import type Stripe from "stripe";

function formatAmount(amountInCents: number, currency: string): string {
	const amount = amountInCents / 100;
	const formatter = new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	});
	return formatter.format(amount);
}

const downloadPdf = async (url: string): Promise<Buffer | null> => {
	try {
		const response = await fetch(url);
		if (!response.ok) return null;
		const arrayBuffer = await response.arrayBuffer();
		return Buffer.from(arrayBuffer);
	} catch {
		return null;
	}
};

export const sendInvoiceEmail = async (
	invoice: Stripe.Invoice,
	admin: { email: string; firstName: string },
) => {
	if (!invoice.hosted_invoice_url) return;

	try {
		const amountFormatted = formatAmount(
			invoice.amount_paid,
			invoice.currency,
		);

		const htmlContent = await renderAsync(
			InvoiceNotificationEmail({
				userName: admin.firstName || "User",
				invoiceNumber: invoice.number || invoice.id,
				amountPaid: amountFormatted,
				currency: invoice.currency,
				date: format(new Date(invoice.created * 1000), "MMM dd, yyyy"),
				hostedInvoiceUrl: invoice.hosted_invoice_url,
			}),
		);

		const attachments: { filename: string; content: Buffer }[] = [];

		if (invoice.invoice_pdf) {
			const pdfBuffer = await downloadPdf(invoice.invoice_pdf);
			if (pdfBuffer) {
				attachments.push({
					filename: `dokploy-invoice-${invoice.number || invoice.id}.pdf`,
					content: pdfBuffer,
				});
			}
		}

		await sendEmail({
			email: admin.email,
			subject: `Dokploy Invoice ${invoice.number || ""} - ${amountFormatted}`,
			text: htmlContent,
			attachments,
		});

		console.log(
			`Invoice email sent to ${admin.email} for invoice ${invoice.number}`,
		);
	} catch (error) {
		console.error(
			`Failed to send invoice email to ${admin.email}:`,
			error instanceof Error ? error.message : error,
		);
	}
};

export const sendPaymentFailedEmail = async (
	invoice: Stripe.Invoice,
	admin: { email: string; firstName: string },
) => {
	if (!invoice.hosted_invoice_url) return;

	try {
		const amountFormatted = formatAmount(
			invoice.amount_due,
			invoice.currency,
		);

		const htmlContent = await renderAsync(
			PaymentFailedEmail({
				userName: admin.firstName || "User",
				invoiceNumber: invoice.number || invoice.id,
				amountDue: amountFormatted,
				currency: invoice.currency,
				date: format(new Date(invoice.created * 1000), "MMM dd, yyyy"),
				hostedInvoiceUrl: invoice.hosted_invoice_url,
			}),
		);

		await sendEmail({
			email: admin.email,
			subject: `Action required: Dokploy payment failed - ${amountFormatted}`,
			text: htmlContent,
		});

		console.log(
			`Payment failed email sent to ${admin.email} for invoice ${invoice.number}`,
		);
	} catch (error) {
		console.error(
			`Failed to send payment failed email to ${admin.email}:`,
			error instanceof Error ? error.message : error,
		);
	}
};
