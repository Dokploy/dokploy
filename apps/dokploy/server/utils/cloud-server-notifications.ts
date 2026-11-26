import { findOrganizationById } from "@dokploy/server";
import CloudServerNoticeEmail from "@dokploy/server/emails/emails/cloud-server-notice";
import type { CloudServer } from "@dokploy/server/services/cloud-server";
import { EXTRA_BANDWIDTH_CENTS_PER_GB } from "@dokploy/server/utils/digitalocean";
import { sendEmail } from "@dokploy/server/verification/send-verification-email";
import { render } from "@react-email/components";
import { format } from "date-fns";
import { WEBSITE_URL } from "@/server/utils/stripe";

const sendNotice = async (
	record: CloudServer,
	content: {
		subject: string;
		title: string;
		message: string;
		warning?: string;
		payment?: boolean;
	},
) => {
	const organization = await findOrganizationById(record.organizationId);
	if (!organization) return;

	const html = await render(
		CloudServerNoticeEmail({
			userName: organization.owner.firstName || "User",
			title: content.title,
			message: content.message,
			warning: content.warning,
			actionLabel: content.payment
				? "Update Payment Method"
				: "View Cloud Servers",
			// A Stripe portal link carries a secret that logs anyone in, so it never travels by email.
			actionUrl: content.payment
				? `${WEBSITE_URL}/dashboard/settings/billing`
				: `${WEBSITE_URL}/dashboard/settings/cloud-servers`,
		}),
	);
	await sendEmail({
		email: organization.owner.email,
		subject: content.subject,
		text: html,
	});
};

export const sendCloudServerRenewalEmail = (
	record: CloudServer,
	renewsAt: Date,
) =>
	sendNotice(record, {
		subject: `Action required: update the payment method for ${record.hostname}`,
		title: "Update your payment method",
		message: `your cloud server ${record.hostname} renews on ${format(renewsAt, "MMM dd, yyyy")} and its payment method is missing or expires before that date.`,
		warning:
			"If the renewal payment fails, the server is powered off and then deleted.",
		payment: true,
	});

export const sendCloudServerPaymentFailedEmail = (
	record: CloudServer,
	deletesAt: Date,
) =>
	sendNotice(record, {
		subject: `Action required: payment failed for ${record.hostname}`,
		title: "Payment failed",
		message: `we could not charge the payment for your cloud server ${record.hostname}, so it has been powered off.`,
		warning: `The server and all its data will be deleted on ${format(deletesAt, "MMM dd, yyyy")} unless the payment is completed.`,
		payment: true,
	});

export const sendCloudServerReactivatedEmail = (record: CloudServer) =>
	sendNotice(record, {
		subject: `Your cloud server ${record.hostname} is back online`,
		title: "Payment received",
		message: `we received your payment and your cloud server ${record.hostname} has been powered back on.`,
	});

export const sendCloudServerDeletedEmail = (record: CloudServer) =>
	sendNotice(record, {
		subject: `Your cloud server ${record.hostname} was deleted`,
		title: "Server deleted",
		message: `your cloud server ${record.hostname} and all its data were deleted because ${record.status === "suspended" ? "its payment was not completed" : "its subscription was cancelled"}. You will not be charged for it again.`,
	});

export const sendCloudServerBandwidthEmail = (
	record: CloudServer,
	percent: number,
	transferTb: number,
) =>
	sendNotice(record, {
		subject:
			percent >= 100
				? `${record.hostname} has used all of its included transfer`
				: `${record.hostname} has used ${percent}% of its included transfer`,
		title: "Transfer usage",
		message: `your cloud server ${record.hostname} has used ${percent}% of the ${transferTb} TB of transfer included in this billing period.`,
		warning: `Transfer above the included amount is billed at $${(EXTRA_BANDWIDTH_CENTS_PER_GB / 100).toFixed(2)} per GB on the next invoice.`,
	});
