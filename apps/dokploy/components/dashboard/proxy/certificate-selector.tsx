import { Loader2 } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { WildcardIndicator } from "./wildcard-indicator";

interface Props {
	form: UseFormReturn<any>;
	host?: string;
}

export const CertificateSelector = ({ form, host }: Props) => {
	const { data: certificates, isLoading } = api.certificates.all.useQuery();
	const certificateId = form.watch("certificateId");
	const isWildcard = host?.startsWith("*.") || false;

	// Find matching certificates for wildcard domains
	const matchingCertificates = isWildcard && host
		? certificates?.filter((cert) => {
				if (!cert.domains || cert.domains.length === 0) return false;
				const baseDomain = host.substring(2); // Remove *. prefix
				return cert.domains.some((domain) => {
					if (domain.startsWith("*.")) {
						const certBase = domain.substring(2);
						return certBase === baseDomain;
					}
					return domain === baseDomain;
				});
			})
		: certificates;

	return (
		<FormField
			control={form.control}
			name="certificateId"
			render={({ field }) => (
				<FormItem>
					<FormLabel className="flex items-center gap-2">
						Certificate {isWildcard && <WildcardIndicator />}
					</FormLabel>
					<Select
						onValueChange={field.onChange}
						defaultValue={field.value}
						disabled={isLoading}
					>
						<FormControl>
							<SelectTrigger>
								<SelectValue placeholder="Select a certificate (optional)" />
							</SelectTrigger>
						</FormControl>
						<SelectContent>
							{isLoading ? (
								<SelectItem value="loading" disabled>
									<Loader2 className="animate-spin size-4 mr-2" />
									Loading certificates...
								</SelectItem>
							) : (
								<>
									<SelectItem value="">None</SelectItem>
									{matchingCertificates && matchingCertificates.length > 0 ? (
										matchingCertificates.map((cert) => (
											<SelectItem key={cert.certificateId} value={cert.certificateId}>
												<div className="flex items-center gap-2">
													<span>{cert.name}</span>
													{cert.isWildcard && <WildcardIndicator />}
												</div>
											</SelectItem>
										))
									) : (
										<SelectItem value="no-match" disabled>
											No matching certificates found
										</SelectItem>
									)}
								</>
							)}
						</SelectContent>
					</Select>
					<FormDescription>
						{isWildcard
							? "Select a certificate that matches this wildcard domain"
							: "Select a certificate for this domain (optional)"}
					</FormDescription>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
};

