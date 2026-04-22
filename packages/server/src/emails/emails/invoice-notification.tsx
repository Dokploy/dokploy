import {
	Body,
	Button,
	Column,
	Container,
	Head,
	Heading,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Row,
	Section,
	Tailwind,
	Text,
} from "@react-email/components";

export type TemplateProps = {
	userName: string;
	invoiceNumber: string;
	amountPaid: string;
	currency: string;
	date: string;
	hostedInvoiceUrl: string;
};

export const InvoiceNotificationEmail = ({
	userName = "User",
	invoiceNumber = "INV-0001",
	amountPaid = "$4.50",
	currency = "usd",
	date = "2024-01-01",
	hostedInvoiceUrl = "https://invoice.stripe.com/example",
}: TemplateProps) => {
	const previewText = `Your Dokploy invoice ${invoiceNumber} for ${amountPaid} is ready`;
	return (
		<Html>
			<Head />
			<Preview>{previewText}</Preview>
			<Tailwind
				config={{
					theme: {
						extend: {
							colors: {
								brand: "#007291",
							},
						},
					},
				}}
			>
				<Body className="bg-[#f4f4f5] my-auto mx-auto font-sans">
					<Container className="my-[40px] mx-auto max-w-[520px]">
						{/* Header */}
						<Section className="bg-[#09090b] rounded-t-xl px-[40px] py-[32px] text-center">
							<Img
								src="https://raw.githubusercontent.com/Dokploy/website/refs/heads/main/apps/docs/public/logo-dokploy-blackpng.png"
								width="190"
								height="120"
								alt="Dokploy"
								className="my-0 mx-auto"
							/>
						</Section>

						{/* Body */}
						<Section className="bg-white px-[40px] py-[32px]">
							<Heading className="text-[#09090b] text-[22px] font-semibold m-0 mb-[8px]">
								Invoice Payment Confirmed
							</Heading>
							<Text className="text-[#71717a] text-[14px] leading-[22px] m-0 mb-[24px]">
								Hello {userName}, thank you for your payment. Here's a summary
								of your invoice.
							</Text>

							{/* Invoice Details Card */}
							<Section className="border border-solid border-[#e4e4e7] rounded-lg overflow-hidden mb-[24px]">
								<Row className="bg-[#fafafa]">
									<Column className="px-[20px] py-[14px] w-[50%]">
										<Text className="text-[#71717a] text-[12px] font-medium uppercase tracking-wider m-0">
											Invoice No.
										</Text>
										<Text className="text-[#09090b] text-[14px] font-semibold m-0 mt-[4px]">
											{invoiceNumber}
										</Text>
									</Column>
									<Column className="px-[20px] py-[14px] w-[50%]">
										<Text className="text-[#71717a] text-[12px] font-medium uppercase tracking-wider m-0">
											Date
										</Text>
										<Text className="text-[#09090b] text-[14px] font-semibold m-0 mt-[4px]">
											{date}
										</Text>
									</Column>
								</Row>
								<Hr className="border-[#e4e4e7] m-0" />
								<Row>
									<Column className="px-[20px] py-[14px]">
										<Text className="text-[#71717a] text-[12px] font-medium uppercase tracking-wider m-0">
											Amount Paid
										</Text>
										<Text className="text-[#09090b] text-[20px] font-bold m-0 mt-[4px]">
											{amountPaid}{" "}
											<span className="text-[#71717a] text-[12px] font-normal uppercase">
												{currency}
											</span>
										</Text>
									</Column>
								</Row>
							</Section>

							{/* Status Badge */}
							<Section className="mb-[24px]">
								<Row>
									<Column>
										<div
											className="inline-block rounded-full bg-[#dcfce7] px-[12px] py-[6px]"
											style={{ display: "inline-block" }}
										>
											<Text className="text-[#15803d] text-[12px] font-semibold m-0">
												Payment Successful
											</Text>
										</div>
									</Column>
								</Row>
							</Section>

							{/* CTA Button */}
							<Section className="text-center mb-[24px]">
								<Button
									href={hostedInvoiceUrl}
									className="bg-[#09090b] rounded-lg text-white text-[14px] font-semibold no-underline text-center px-[24px] py-[12px]"
								>
									View Invoice Online
								</Button>
							</Section>

							<Text className="text-[#a1a1aa] text-[13px] leading-[20px] m-0 text-center">
								A PDF copy of this invoice is attached to this email for your
								records.
							</Text>
						</Section>

						{/* Footer */}
						<Section className="bg-[#fafafa] rounded-b-xl px-[40px] py-[24px] text-center border-t border-solid border-[#e4e4e7]">
							<Text className="text-[#a1a1aa] text-[12px] leading-[18px] m-0">
								This is an automated email from{" "}
								<Link
									href="https://dokploy.com"
									className="text-[#71717a] underline"
								>
									Dokploy Cloud
								</Link>
								. If you have any questions about your billing, please contact
								our{" "}
								<Link
									href="https://discord.gg/2tBnJ3jDJc"
									className="text-[#71717a] underline"
								>
									support team
								</Link>
								.
							</Text>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
};

export default InvoiceNotificationEmail;
