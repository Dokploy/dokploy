import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import copy from "copy-to-clipboard";
import { Copy } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const sslSchema = z.object({
	sslMode: z.enum(["disabled", "optional", "required"]),
});

type SslForm = z.infer<typeof sslSchema>;

interface Props {
	postgresId: string;
}

export const ShowSslPostgres = ({ postgresId }: Props) => {
	const { data, refetch } = api.postgres.one.useQuery({ postgresId });
	const { mutateAsync, isPending } = api.postgres.update.useMutation();

	const form = useForm<SslForm>({
		defaultValues: {
			sslMode: "disabled",
		},
		resolver: zodResolver(sslSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				sslMode: data.sslMode ?? "disabled",
			});
		}
	}, [data, form]);

	const onSubmit = async (values: SslForm) => {
		await mutateAsync({
			postgresId,
			sslMode: values.sslMode,
		})
			.then(async () => {
				toast.success("SSL settings saved. Deploy to apply them.");
				await refetch();
			})
			.catch((error: Error) => {
				toast.error(error?.message || "Error saving the SSL settings");
			});
	};

	return (
		<div className="flex w-full flex-col gap-5">
			<Card className="bg-background">
				<CardHeader>
					<CardTitle className="text-xl">SSL/TLS</CardTitle>
					<CardDescription>
						Encrypt connections to this database. Certificates are generated
						automatically on deploy and kept across redeploys. Changes apply on
						the next deploy.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex w-full flex-col gap-4">
					<Form {...form}>
						<form
							onSubmit={form.handleSubmit(onSubmit)}
							className="flex flex-col gap-4"
						>
							<FormField
								control={form.control}
								name="sslMode"
								render={({ field }) => (
									<FormItem>
										<FormLabel>SSL Mode</FormLabel>
										<Select onValueChange={field.onChange} value={field.value}>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Select an SSL mode" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value="disabled">Disabled</SelectItem>
												<SelectItem value="optional">
													Enabled — TLS optional
												</SelectItem>
												<SelectItem value="required">
													Required — TLS only
												</SelectItem>
											</SelectContent>
										</Select>
										<FormDescription>
											&quot;Enabled&quot; accepts encrypted and plain-text
											connections. &quot;Required&quot; rejects clients that
											don&apos;t use TLS — every client, including internal
											services, must connect with SSL. When a custom Command is
											set, the SSL flags are not applied automatically; add them
											to your command yourself.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<div className="flex justify-end">
								<Button type="submit" isLoading={isPending}>
									Save
								</Button>
							</div>
						</form>
					</Form>
					{data?.sslMode !== "disabled" && (
						<div className="flex flex-col gap-2">
							<div className="flex flex-row items-center justify-between">
								<Label>CA Certificate</Label>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="flex items-center gap-1.5"
									onClick={() => {
										copy(data?.sslCACertificate ?? "");
										toast.success("CA Certificate Copied!");
									}}
								>
									<Copy className="size-3.5" />
									Copy
								</Button>
							</div>
							<Textarea
								disabled
								className="font-mono text-xs"
								rows={8}
								value={
									data?.sslCACertificate ??
									"Certificates are generated on the next deploy."
								}
							/>
							<AlertBlock type="info">
								Clients can connect with sslmode=require, or verify the server
								with sslmode=verify-ca / verify-full using this CA. The
								certificate is self-signed and issued for the internal service
								name and localhost, so verify-full only matches those hostnames.
							</AlertBlock>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};
