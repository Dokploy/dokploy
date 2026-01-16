import { zodResolver } from "@hookform/resolvers/zod";
import { GlobeIcon } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";

const wildcardDomainSchema = z.object({
	wildcardDomain: z
		.string()
		.transform((val) => (val === "" ? null : val))
		.nullable()
		.refine(
			(val) => {
				if (val === null || val === "") return true;
				// Validate wildcard domain format: should start with * and be a valid domain pattern
				// Examples: *.example.com, *-apps.example.com, *.apps.mydomain.org
				const wildcardPattern =
					/^\*[\.\-]?[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
				return wildcardPattern.test(val);
			},
			{
				message:
					'Invalid wildcard domain format. Use patterns like "*.example.com" or "*-apps.example.com"',
			},
		),
});

type WildcardDomainForm = z.infer<typeof wildcardDomainSchema>;

export const WildcardDomain = () => {
	const { data: wildcardDomain, refetch } =
		api.organization.getWildcardDomain.useQuery();
	const { mutateAsync, isLoading } =
		api.organization.updateWildcardDomain.useMutation();

	const form = useForm<WildcardDomainForm>({
		defaultValues: {
			wildcardDomain: "",
		},
		resolver: zodResolver(wildcardDomainSchema),
	});

	useEffect(() => {
		if (wildcardDomain !== undefined) {
			form.reset({
				wildcardDomain: wildcardDomain || "",
			});
		}
	}, [form, wildcardDomain]);

	const onSubmit = async (data: WildcardDomainForm) => {
		await mutateAsync({
			wildcardDomain: data.wildcardDomain,
		})
			.then(async () => {
				await refetch();
				toast.success("Wildcard domain updated successfully");
			})
			.catch((error) => {
				toast.error(
					error instanceof Error
						? error.message
						: "Error updating the wildcard domain",
				);
			});
	};

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader className="flex flex-row gap-2 flex-wrap justify-between items-center">
						<div className="flex flex-col gap-1">
							<CardTitle className="text-xl flex flex-row gap-2">
								<GlobeIcon className="size-6 text-muted-foreground self-center" />
								Custom Wildcard Domain
							</CardTitle>
							<CardDescription>
								Configure a custom wildcard domain pattern for auto-generated
								application domains. This replaces the default traefik.me
								domains for all projects in this organization.
							</CardDescription>
						</div>
					</CardHeader>
					<CardContent className="space-y-4 py-6 border-t">
						<AlertBlock type="info">
							<div className="space-y-2">
								<p className="font-medium">How it works:</p>
								<ul className="list-disc list-inside space-y-1 text-sm">
									<li>
										Set a wildcard domain pattern like{" "}
										<code className="bg-muted px-1 rounded">
											*-apps.example.com
										</code>
									</li>
									<li>
										New applications will get domains like{" "}
										<code className="bg-muted px-1 rounded">
											myapp-a1b2c3-apps.example.com
										</code>
									</li>
									<li>
										Make sure you have a DNS wildcard record (*.example.com)
										pointing to your server
									</li>
									<li>
										Individual projects can override this setting with their own
										wildcard domain
									</li>
								</ul>
							</div>
						</AlertBlock>

						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								className="grid w-full gap-4"
							>
								<FormField
									control={form.control}
									name="wildcardDomain"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>Wildcard Domain Pattern</FormLabel>
												<FormControl>
													<Input
														className="w-full"
														placeholder="*-apps.example.com or *.apps.example.com"
														{...field}
														value={field.value || ""}
													/>
												</FormControl>
												<FormDescription>
													Leave empty to use the default traefik.me domains. The
													asterisk (*) will be replaced with the app name and a
													random identifier.
												</FormDescription>
												<FormMessage />
											</FormItem>
										);
									}}
								/>

								<div className="flex w-full justify-end">
									<Button isLoading={isLoading} type="submit">
										Save
									</Button>
								</div>
							</form>
						</Form>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
