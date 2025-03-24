import {
	Body,
	Container,
	Head,
	Heading,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Section,
	Text,
	Button,
} from "@react-email/components";
import * as React from "react";

interface ResendLicenseEmailProps {
	customerName: string;
	licenseKey: string;
	productName: string;
	requestDate?: Date;
}

const baseUrl = "https://dokploy.com";

export const ResendLicenseEmail = ({
	customerName = "John Doe",
	licenseKey = "1234567890",
	productName = "Dokploy",
	requestDate = new Date(),
}: ResendLicenseEmailProps): React.ReactElement => {
	const formattedRequestDate = requestDate.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});

	return (
		<Html>
			<Head />
			<Preview>Your Requested Dokploy License Key 🔑</Preview>
			<Body style={main}>
				<Container style={container}>
					<Section style={heroSection}>
						<Img
							src={`${baseUrl}/og.png`}
							width="180"
							height="auto"
							alt="Dokploy"
							style={{ borderRadius: "10px", margin: "0 auto" }}
						/>
						<Heading style={heroTitle}>Here's Your License Key</Heading>
					</Section>

					<Section style={mainContent}>
						<Text style={greeting}>Hi {customerName},</Text>
						<Text style={text}>
							As requested on {formattedRequestDate}, here is your {productName}{" "}
							license key. This is the same active license key associated with
							your account:
						</Text>

						<Section style={licenseContainer}>
							<Text style={licenseLabel}>Your Active License Key</Text>
							<Text style={licenseKeyStyle}>{licenseKey}</Text>
						</Section>

						<Section style={activationSection}>
							<Heading as="h2" style={h2}>
								Quick Activation Guide
							</Heading>
							<div style={stepsContainer}>
								<Text style={steps}>
									1. Go to your Dokploy dashboard
									<br />
									2. Navigate to Settings → License
									<br />
									3. Enter your license key above
									<br />
									4. Click "Activate License"
								</Text>
							</div>
							<Button href="https://dokploy.com/dashboard" style={ctaButton}>
								Go to Dashboard
							</Button>
						</Section>

						<Hr style={hr} />

						<Section style={securitySection}>
							<Text style={securityText}>
								🔒 For security: If you didn't request this license key, please
								contact our support team immediately.
							</Text>
						</Section>

						<Section style={supportSection}>
							<Text style={supportText}>
								Need help? Our support team is ready to assist you.
								<br />
								<Link style={link} href="mailto:support@dokploy.com">
									support@dokploy.com
								</Link>
							</Text>
						</Section>
					</Section>
				</Container>
			</Body>
		</Html>
	);
};

const main = {
	backgroundColor: "#f6f9fc",
	fontFamily:
		'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
	margin: "0 auto",
	padding: "40px 0",
	maxWidth: "600px",
};

const heroSection = {
	backgroundColor: "#ffffff",
	borderRadius: "8px",
	padding: "40px 20px",
	textAlign: "center" as const,
	boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

const heroTitle = {
	color: "#1a1a1a",
	fontSize: "28px",
	fontWeight: "800",
	lineHeight: "1.3",
	margin: "20px 0 0",
	padding: "0",
};

const mainContent = {
	backgroundColor: "#ffffff",
	borderRadius: "8px",
	marginTop: "24px",
	padding: "40px",
	boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

const greeting = {
	fontSize: "20px",
	lineHeight: "1.3",
	fontWeight: "600",
	color: "#1a1a1a",
	margin: "0 0 20px",
};

const text = {
	color: "#4a5568",
	fontSize: "16px",
	lineHeight: "1.6",
	margin: "0 0 24px",
};

const licenseContainer = {
	background: "linear-gradient(135deg, #2563eb 0%, #1e40af 100%)",
	borderRadius: "12px",
	padding: "24px",
	margin: "32px 0",
	textAlign: "center" as const,
};

const licenseLabel = {
	color: "#ffffff",
	fontSize: "14px",
	textTransform: "uppercase" as const,
	letterSpacing: "1px",
	margin: "0 0 12px",
};

const licenseKeyStyle = {
	fontFamily: "monospace",
	fontSize: "24px",
	color: "#ffffff",
	margin: "0",
	wordBreak: "break-all" as const,
	fontWeight: "600",
};

const validitySection = {
	textAlign: "center" as const,
	margin: "24px 0",
};

const validityText = {
	color: "#4a5568",
	fontSize: "16px",
};

const h2 = {
	color: "#1a1a1a",
	fontSize: "20px",
	fontWeight: "600",
	margin: "0 0 20px",
	padding: "0",
};

const activationSection = {
	backgroundColor: "#f8fafc",
	borderRadius: "8px",
	padding: "24px",
	margin: "32px 0",
};

const stepsContainer = {
	margin: "20px 0",
};

const steps = {
	color: "#4a5568",
	fontSize: "16px",
	lineHeight: "1.8",
	margin: "0",
};

const ctaButton = {
	backgroundColor: "#2563eb",
	borderRadius: "6px",
	color: "#ffffff",
	fontSize: "16px",
	fontWeight: "600",
	textDecoration: "none",
	textAlign: "center" as const,
	display: "inline-block",
	padding: "12px 24px",
	margin: "20px 0 0",
};

const hr = {
	borderColor: "#e2e8f0",
	margin: "40px 0",
};

const securitySection = {
	backgroundColor: "#fff5f5",
	borderRadius: "8px",
	padding: "16px",
	margin: "0 0 32px 0",
};

const securityText = {
	color: "#e53e3e",
	fontSize: "14px",
	lineHeight: "1.5",
	margin: "0",
	textAlign: "center" as const,
};

const supportSection = {
	textAlign: "center" as const,
};

const supportText = {
	color: "#64748b",
	fontSize: "14px",
	lineHeight: "1.5",
	margin: "0",
};

const link = {
	color: "#2563eb",
	textDecoration: "none",
	fontWeight: "500",
};

export default ResendLicenseEmail;
