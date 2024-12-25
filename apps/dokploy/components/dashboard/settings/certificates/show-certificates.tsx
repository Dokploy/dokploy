import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { AlertCircle, Link, ShieldCheck } from "lucide-react";
import { AddCertificate } from "./add-certificate";
import { DeleteCertificate } from "./delete-certificate";

export const ShowCertificates = () => {
	const { data } = api.certificates.all.useQuery();

	const extractExpirationDate = (certData: string): Date | null => {
		try {
			const match = certData.match(
				/-----BEGIN CERTIFICATE-----\s*([^-]+)\s*-----END CERTIFICATE-----/,
			);
			if (!match?.[1]) return null;

			const base64Cert = match[1].replace(/\s/g, "");
			const binaryStr = window.atob(base64Cert);
			const bytes = new Uint8Array(binaryStr.length);

			for (let i = 0; i < binaryStr.length; i++) {
				bytes[i] = binaryStr.charCodeAt(i);
			}

			let dateFound = 0;
			for (let i = 0; i < bytes.length - 2; i++) {
				if (bytes[i] === 0x17 || bytes[i] === 0x18) {
					const dateType = bytes[i];
					const dateLength = bytes[i + 1];
					if (typeof dateLength === "undefined") continue;

					if (dateFound === 0) {
						dateFound++;
						i += dateLength + 1;
						continue;
					}

					let dateStr = "";
					for (let j = 0; j < dateLength; j++) {
						const charCode = bytes[i + 2 + j];
						if (typeof charCode === "undefined") continue;
						dateStr += String.fromCharCode(charCode);
					}

					if (dateType === 0x17) {
						// UTCTime (YYMMDDhhmmssZ)
						const year = Number.parseInt(dateStr.slice(0, 2));
						const fullYear = year >= 50 ? 1900 + year : 2000 + year;
						return new Date(
							Date.UTC(
								fullYear,
								Number.parseInt(dateStr.slice(2, 4)) - 1,
								Number.parseInt(dateStr.slice(4, 6)),
								Number.parseInt(dateStr.slice(6, 8)),
								Number.parseInt(dateStr.slice(8, 10)),
								Number.parseInt(dateStr.slice(10, 12)),
							),
						);
					}

					// GeneralizedTime (YYYYMMDDhhmmssZ)
					return new Date(
						Date.UTC(
							Number.parseInt(dateStr.slice(0, 4)),
							Number.parseInt(dateStr.slice(4, 6)) - 1,
							Number.parseInt(dateStr.slice(6, 8)),
							Number.parseInt(dateStr.slice(8, 10)),
							Number.parseInt(dateStr.slice(10, 12)),
							Number.parseInt(dateStr.slice(12, 14)),
						),
					);
				}
			}
			return null;
		} catch (error) {
			console.error("Error parsing certificate:", error);
			return null;
		}
	};

	const getExpirationStatus = (certData: string) => {
		const expirationDate = extractExpirationDate(certData);

		if (!expirationDate)
			return {
				status: "unknown" as const,
				className: "text-muted-foreground",
				message: "Could not determine expiration",
			};

		const now = new Date();
		const daysUntilExpiration = Math.ceil(
			(expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
		);

		if (daysUntilExpiration < 0) {
			return {
				status: "expired" as const,
				className: "text-red-500",
				message: `Expired on ${expirationDate.toLocaleDateString([], {
					year: "numeric",
					month: "long",
					day: "numeric",
				})}`,
			};
		}

		if (daysUntilExpiration <= 30) {
			return {
				status: "warning" as const,
				className: "text-yellow-500",
				message: `Expires in ${daysUntilExpiration} days`,
			};
		}

		return {
			status: "valid" as const,
			className: "text-muted-foreground",
			message: `Expires ${expirationDate.toLocaleDateString([], {
				year: "numeric",
				month: "long",
				day: "numeric",
			})}`,
		};
	};

	const getCertificateChainInfo = (certData: string) => {
		const certCount = (certData.match(/-----BEGIN CERTIFICATE-----/g) || [])
			.length;
		return certCount > 1
			? {
					isChain: true,
					count: certCount,
				}
			: {
					isChain: false,
					count: 1,
				};
	};

	return (
		<div className="h-full">
			<Card className="bg-transparent h-full">
				<CardHeader>
					<CardTitle className="text-xl">Certificates</CardTitle>
					<CardDescription>
						Add custom certificates to your application.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2 pt-4 h-full">
					{!data?.length ? (
						<div className="flex flex-col items-center gap-3">
							<ShieldCheck className="size-8 self-center text-muted-foreground" />
							<span className="text-base text-muted-foreground">
								To create a certificate it is required to upload an existing
								certificate
							</span>
							<AddCertificate />
						</div>
					) : (
						<div className="flex flex-col gap-6">
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
								{data.map((certificate, index) => {
									const expiration = getExpirationStatus(
										certificate.certificateData,
									);
									const chainInfo = getCertificateChainInfo(
										certificate.certificateData,
									);
									return (
										<div
											key={certificate.certificateId}
											className="flex flex-col border p-4 rounded-lg space-y-2"
										>
											<div className="flex items-center justify-between">
												<div className="flex items-center gap-2">
													<span className="text-sm font-medium">
														{index + 1}. {certificate.name}
													</span>
													{chainInfo.isChain && (
														<div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/50">
															<Link className="size-3 text-muted-foreground" />
															<span className="text-xs text-muted-foreground">
																Chain ({chainInfo.count})
															</span>
														</div>
													)}
												</div>
												<DeleteCertificate
													certificateId={certificate.certificateId}
												/>
											</div>
											<div
												className={`text-xs flex items-center gap-1.5 ${expiration.className}`}
											>
												{expiration.status !== "valid" && (
													<AlertCircle className="size-3" />
												)}
												{expiration.message}
												{certificate.autoRenew &&
													expiration.status !== "valid" && (
														<span className="text-xs text-emerald-500 ml-1">
															(Auto-renewal enabled)
														</span>
													)}
											</div>
										</div>
									);
								})}
							</div>
							<div>
								<AddCertificate />
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};
