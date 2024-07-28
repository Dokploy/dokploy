import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { ShieldCheck } from "lucide-react";
import { AddCertificate } from "./add-certificate";
import { DeleteCertificate } from "./delete-certificate";

export const ShowCertificates = () => {
	const { data } = api.certificates.all.useQuery();

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
					{data?.length === 0 ? (
						<div className="flex flex-col items-center gap-3">
							<ShieldCheck className="size-8 self-center text-muted-foreground" />
							<span className="text-base text-muted-foreground">
								To create a certificate is required to upload your certificate
							</span>
							<AddCertificate />
						</div>
					) : (
						<div className="flex flex-col gap-6">
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
								{data?.map((destination, index) => (
									<div
										key={destination.certificateId}
										className="flex items-center justify-between border p-4 rounded-lg"
									>
										<span className="text-sm text-muted-foreground">
											{index + 1}. {destination.name}
										</span>
										<div className="flex flex-row gap-3">
											<DeleteCertificate
												certificateId={destination.certificateId}
											/>
										</div>
									</div>
								))}
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
