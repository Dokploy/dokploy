import { zodResolver } from "@hookform/resolvers/zod";
import { GlobeIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
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
import { Switch } from "@/components/ui/switch";
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
				const wildcardPattern =
					/^\*[.-]?[a-zA-Z0-9]([a-zA-Z0-9\-.]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
				return wildcardPattern.test(val);
			},
			{
				message:
					'Invalid wildcard domain format. Use patterns like "*.example.com" or "*-apps.example.com"',
			},
		),
	useOrganizationWildcard: z.boolean(),
});

type WildcardDomainForm = z.infer<typeof wildcardDomainSchema>;

interface Props {
	projectId: string;
	children?: React.ReactNode;
}

export const ProjectWildcardDomain = ({ projectId, children }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();

	const { data, refetch } = api.project.getWildcardDomainConfig.useQuery(
		{ projectId },
		{ enabled: !!projectId && isOpen },
	);

	const { mutateAsync, isLoading } =
		api.project.updateWildcardDomain.useMutation();

	const form = useForm<WildcardDomainForm>({
		defaultValues: {
			wildcardDomain: "",
			useOrganizationWildcard: true,
		},
		resolver: zodResolver(wildcardDomainSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				wildcardDomain: data.projectWildcardDomain || "",
				useOrganizationWildcard: data.useOrganizationWildcard,
			});
		}
	}, [data, form]);

	const useOrganizationWildcard = form.watch("useOrganizationWildcard");
	const projectWildcardDomain = form.watch("wildcardDomain");

	const effectiveWildcard = projectWildcardDomain
		? projectWildcardDomain
		: useOrganizationWildcard
			? data?.organizationWildcardDomain
			: null;

	const onSubmit = async (formData: WildcardDomainForm) => {
		await mutateAsync({
			projectId,
			wildcardDomain: formData.wildcardDomain,
			useOrganizationWildcard: formData.useOrganizationWildcard,
		})
			.then(async () => {
				await refetch();
				await utils.project.one.invalidate({ projectId });
				toast.success("Wildcard domain settings updated successfully");
			})
			.catch((error) => {
				toast.error(
					error instanceof Error
						? error.message
						: "Error updating wildcard domain settings",
				);
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{children ?? (
					<DropdownMenuItem
						className="w-full cursor-pointer space-x-3"
						onSelect={(e) => e.preventDefault()}
					>
						<GlobeIcon className="size-4" />
						<span>Wildcard Domain</span>
					</DropdownMenuItem>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Project Wildcard Domain</DialogTitle>
					<DialogDescription>
						Configure a custom wildcard domain pattern for auto-generated
						application domains in this project.
					</DialogDescription>
				</DialogHeader>

				<AlertBlock type="info">
					<div className="space-y-2">
						<p className="font-medium">Domain Resolution:</p>
						<ul className="list-disc list-inside space-y-1 text-sm">
							<li>
								If a project-specific domain is set, it will be used for this
								project
							</li>
							<li>
								Otherwise, if "Inherit from organization" is enabled, the
								organization's wildcard domain will be used
							</li>
							<li>
								If neither is configured, the default traefik.me domain will be
								used
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
							name="useOrganizationWildcard"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between p-3 border rounded-lg shadow-sm">
									<div className="space-y-0.5">
										<FormLabel>Inherit from Organization</FormLabel>
										<FormDescription>
											{data?.organizationWildcardDomain ? (
												<>
													Use organization's wildcard domain:{" "}
													<code className="bg-muted px-1 rounded">
														{data.organizationWildcardDomain}
													</code>
												</>
											) : (
												"No organization wildcard domain configured"
											)}
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
											disabled={!data?.organizationWildcardDomain}
										/>
									</FormControl>
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="wildcardDomain"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Project-Specific Wildcard Domain</FormLabel>
									<FormControl>
										<Input
											className="w-full"
											placeholder="*-apps.example.com"
											{...field}
											value={field.value || ""}
										/>
									</FormControl>
									<FormDescription>
										Leave empty to use the organization's wildcard domain (if
										enabled) or the default traefik.me domain.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Show effective wildcard domain */}
						<div className="p-3 bg-muted/50 rounded-lg">
							<p className="text-sm font-medium">Effective Wildcard Domain:</p>
							<p className="text-sm text-muted-foreground">
								{effectiveWildcard ? (
									<code className="bg-muted px-1 rounded">
										{effectiveWildcard}
									</code>
								) : (
									<span>Default (traefik.me)</span>
								)}
							</p>
						</div>

						<DialogFooter>
							<Button isLoading={isLoading} type="submit">
								Save Settings
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
