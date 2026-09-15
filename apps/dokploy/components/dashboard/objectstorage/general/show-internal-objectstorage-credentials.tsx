import { ToggleVisibilityInput } from "@/components/shared/toggle-visibility-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";

const PROVIDER_DEFAULT_PORTS: Record<string, number> = {
	minio: 9000,
	garage: 3900,
	alarik: 8080,
	rustfs: 9000,
};

interface Props {
	objectStorageId: string;
}

export const ShowInternalObjectStorageCredentials = ({
	objectStorageId,
}: Props) => {
	const { data } = api.objectstorage.one.useQuery({ objectStorageId });

	const s3Port = data?.provider ? PROVIDER_DEFAULT_PORTS[data.provider] : 9000;

	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">Internal Credentials</CardTitle>
					</CardHeader>
					<CardContent className="flex w-full flex-row gap-4">
						<div className="grid w-full md:grid-cols-2 gap-4 md:gap-8">
							<div className="flex flex-col gap-2">
								<Label>Access Key</Label>
								<Input enableCopyButton disabled value={data?.rootUser} />
							</div>
							<div className="flex flex-col gap-2">
								<Label>Secret Key</Label>
								<ToggleVisibilityInput value={data?.rootPassword} disabled />
							</div>
							<div className="flex flex-col gap-2">
								<Label>Region</Label>
								<Input disabled value={data?.region || "us-east-1"} />
							</div>
							<div className="flex flex-col gap-2">
								<Label>Bucket</Label>
								<Input disabled value={data?.bucket || "N/A"} />
							</div>
							<div className="flex flex-col gap-2">
								<Label>Internal S3 Endpoint</Label>
								<ToggleVisibilityInput
									disabled
									value={`http://${data?.appName}:${s3Port}`}
								/>
							</div>
							<div className="flex flex-col gap-2">
								<Label>Internal Host</Label>
								<Input enableCopyButton disabled value={data?.appName} />
							</div>
							{data?.provider === "minio" && (
								<div className="flex flex-col gap-2">
									<Label>Console URL</Label>
									<ToggleVisibilityInput
										disabled
										value={`http://${data?.appName}:9001`}
									/>
								</div>
							)}
						</div>
					</CardContent>
				</Card>
			</div>
		</>
	);
};
