import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { CloudProviderLogo } from "@/components/icons/cloud-provider-icons";
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
import { type CloudProviderDefinition } from "@dokploy/server/providers/registry-client";
import { type ProvisionableCloudProviderDefinition } from "@dokploy/server/providers/registry-client";

type AddProviderInput = Record<string, string>;

const buildAddProviderSchema = (provider: CloudProviderDefinition) => {
	const shape: Record<string, z.ZodTypeAny> = {};

	for (const field of provider.credentialFields) {
		shape[field.name] = field.required === false
			? z.string().optional()
			: z.string().min(1, `${field.label} is required`);
	}

	return z.object(shape);
};

export const AddCloudProvider = ({
	provider,
}: {
	provider: ProvisionableCloudProviderDefinition;
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();
	const schema = useMemo(() => buildAddProviderSchema(provider), [provider]);

	const { mutateAsync, isLoading } =
		api.cloudProvider.credentials.upsert.useMutation();

	const form = useForm<AddProviderInput>({
		defaultValues: provider.credentialFields.reduce<AddProviderInput>(
			(accumulator, field) => {
				accumulator[field.name] = "";
				return accumulator;
			},
			{},
		),
		resolver: zodResolver(schema as any) as any,
	});

	const onSubmit = async (data: AddProviderInput) => {
		const apiTokenField = provider.credentialFields.find(
			(field) => field.storage === "apiToken",
		);

		if (!apiTokenField) {
			toast.error(`Provider configuration for ${provider.label} is invalid`);
			return;
		}

		const config = provider.credentialFields.reduce<Record<string, unknown>>(
			(accumulator, field) => {
				if (field.storage === "config" && data[field.name]) {
					accumulator[field.name] = data[field.name];
				}
				return accumulator;
			},
			{},
		);

		await mutateAsync({
			provider: provider.id,
			apiToken: data[apiTokenField.name] || "",
			config,
		})
			.then(async () => {
				toast.success(`${provider.label} credentials added successfully!`);
				await utils.cloudProvider.credentials.list.invalidate();
				setIsOpen(false);
				form.reset();
			})
			.catch((error: unknown) => {
				toast.error(
					error instanceof Error
						? error.message
						: `Error adding ${provider.label} credentials`,
				);
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="secondary" className="flex items-center space-x-1">
					<CloudProviderLogo icon={provider.icon} className="size-4" />
					<span>{provider.label}</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<CloudProviderLogo icon={provider.icon} className="size-5" />
						Add {provider.label} Provider
					</DialogTitle>
					<DialogDescription>{provider.description}</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						{provider.credentialFields.map((field) => (
							<FormField
								key={field.name}
								control={form.control}
								name={field.name as any}
								render={({ field: formField }) => (
									<FormItem>
										<FormLabel>{field.label}</FormLabel>
											<FormControl>
												<Input
													placeholder={field.placeholder}
													{...formField}
													type={field.type}
												autoComplete={field.autoComplete}
											/>
										</FormControl>
										<FormDescription>
											{field.helpText}{" "}
											{field.storage === "apiToken" && provider.apiTokenHelpUrl ? (
												<a
													href={provider.apiTokenHelpUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="text-primary hover:underline"
												>
													Open the console
												</a>
											) : null}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						))}

						<DialogFooter>
							<Button
								type="button"
								variant="secondary"
								onClick={() => {
									setIsOpen(false);
									form.reset();
								}}
							>
								Cancel
							</Button>
							<Button type="submit" isLoading={isLoading}>
								Add Provider
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
