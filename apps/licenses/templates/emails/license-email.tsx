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

interface LicenseEmailProps {
	customerName: string;
	licenseKey: string;
	productName: string;
	expirationDate: Date;
	features: string[];
}

const baseUrl = "https://dokploy.com";

export const LicenseEmail = ({
	customerName = "John Doe",
	licenseKey = "1234567890",
	productName = "Dokploy",
	expirationDate = new Date(),
	features = ["Feature 1", "Feature 2", "Feature 3"],
}: LicenseEmailProps): React.ReactElement => {
	const formattedDate = expirationDate.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	return (
		<Html>
			<Head />
			<Preview>Your Dokploy License Key is Here! 🚀</Preview>
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
						<Heading style={heroTitle}>
							Welcome to the Future of Deployment
						</Heading>
					</Section>

					<Section style={mainContent}>
						<Text style={greeting}>Hi {customerName},</Text>
						<Text style={text}>
							Thank you for choosing {productName}! We're excited to have you on
							board. Your premium license key is ready to unlock all the
							powerful features:
						</Text>

						<Section style={licenseContainer}>
							<Text style={licenseLabel}>Your License Key</Text>
							<Text style={licenseKeyStyle}>{licenseKey}</Text>
						</Section>

						<Section style={validitySection}>
							<Text style={validityText}>
								🗓️ Next billing date: <strong>{formattedDate}</strong>
							</Text>
						</Section>

						<Section style={featuresContainer}>
							<Heading as="h2" style={h2}>
								🎉 Your Premium Features
							</Heading>
							<div style={featureGrid}>
								{features.map((feature, index) => (
									<Text key={index} style={featureItem}>
										<span style={checkmark}>✓</span> {feature}
									</Text>
								))}
							</div>
						</Section>

						<Section style={activationSection}>
							<Heading as="h2" style={h2}>
								Getting Started
							</Heading>
							<div style={stepsContainer}>
								<Text style={steps}>
									1. Go to your Dokploy dashboard
									<br />
									2. Navigate to Settings → License
									<br />
									3. Enter your license key
									<br />
									4. Click "Activate License"
								</Text>
							</div>
							<Button href="https://dokploy.com/dashboard" style={ctaButton}>
								Activate Your License
							</Button>
						</Section>

						<Hr style={hr} />

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

const featuresContainer = {
	margin: "40px 0",
};

const featureGrid = {
	display: "grid",
	gridTemplateColumns: "1fr",
	gap: "12px",
};

const featureItem = {
	color: "#4a5568",
	fontSize: "16px",
	lineHeight: "1.5",
	margin: "0",
	display: "flex",
	alignItems: "center",
};

const checkmark = {
	color: "#2563eb",
	fontWeight: "bold",
	marginRight: "12px",
	fontSize: "18px",
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

export default LicenseEmail;
