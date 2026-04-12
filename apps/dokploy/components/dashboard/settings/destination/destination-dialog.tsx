import { useEffect, useMemo } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { PlusIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { DESTINATION_SCHEMAS, type DestinationType } from "./destination-schema";

type DynamicFormValues = {
    name: string;
    serverId?: string;
    additionalFlags: { value: string }[];
} & Record<string, string | undefined | { value: string }[]>;

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    destinationId?: string;
    type: DestinationType;
}

export const DestinationDialog = ({
    open,
    onOpenChange,
    destinationId,
    type,
}: Props) => {
    const utils = api.useUtils();
    const { data: servers } = api.server.withSSHKey.useQuery();
    const { data: isCloud } = api.settings.isCloud.useQuery();

    const schema = DESTINATION_SCHEMAS.find((item) => item.type === type);
    const properties = schema?.properties ?? [];

    const defaultDynamicValues = useMemo(
        () =>
            Object.fromEntries(properties.map((property) => [property.name, property.default])) as Record<
                string,
                string
            >,
        [properties],
    );

    const { mutateAsync, isError, error, isPending } = destinationId
        ? api.destination.update.useMutation()
        : api.destination.create.useMutation();

    const { data: destination } = api.destination.one.useQuery(
        {
            destinationId: destinationId || "",
        },
        {
            enabled: !!destinationId,
            refetchOnWindowFocus: false,
        },
    );

    const {
        mutateAsync: testConnection,
        isPending: isPendingConnection,
        error: connectionError,
        isError: isErrorConnection,
    } = api.destination.testConnection.useMutation();

    const form = useForm<DynamicFormValues>({
        defaultValues: {
            name: "",
            serverId: undefined,
            additionalFlags: [],
            ...defaultDynamicValues,
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "additionalFlags",
    });

    useEffect(() => {
        if (destination && destination.type === type) {
            const destinationRecord = destination as Record<string, unknown>;
            const destinationCredentials =
                typeof destinationRecord.credentials === "object" && destinationRecord.credentials
                    ? (destinationRecord.credentials as Record<string, unknown>)
                    : {};

            const credentialValues = properties.reduce<Record<string, string>>(
                (acc, property) => {
                    if (destinationId && property.hideOnEdit) {
                        acc[property.name] = "";
                        return acc;
                    }

                    const value =
                        destinationRecord[property.name] ?? destinationCredentials[property.name];

                    acc[property.name] = typeof value === "string" ? value : property.default;
                    return acc;
                },
                {},
            );

            form.reset({
                name: destination.name,
                additionalFlags:
                    destination.additionalFlags?.map((flag) => ({ value: flag })) ?? [],
                ...defaultDynamicValues,
                ...credentialValues,
            });
            return;
        }

        form.reset({
            name: "",
            serverId: undefined,
            additionalFlags: [],
            ...defaultDynamicValues,
        });
    }, [destination, type, form, properties, defaultDynamicValues]);

    const getCredentialPayload = (values: Record<string, unknown>, isUpdate: boolean) => {
        return Object.fromEntries(
            properties.flatMap((property) => {
                const rawValue = values[property.name];
                const value =
                    typeof rawValue === "string" ? rawValue : property.default;

                if (isUpdate && property.skipUpdateIfEmpty && value.trim().length === 0) {
                    return [];
                }

                return [[property.name, value]];
            }),
        );
    };

    const getValidationErrors = (
        values: Record<string, unknown>,
        options?: { allowEmptyOnUpdate?: boolean },
    ) => {
        const errors: string[] = [];
        if (!values.name || String(values.name).trim().length === 0) {
            errors.push("name: Name is required");
        }
        for (const property of properties) {
            if (!property.required) {
                continue;
            }
            const value = values[property.name];
            if (typeof value !== "string" || value.trim().length === 0) {
                if (
                    options?.allowEmptyOnUpdate &&
                    destinationId &&
                    property.skipUpdateIfEmpty
                ) {
                    continue;
                }
                errors.push(`${property.name}: ${property.label} is required`);
            }
        }
        return errors;
    };

    const onSubmit = async (values: DynamicFormValues) => {
        const validationErrors = getValidationErrors(values, {
            allowEmptyOnUpdate: true,
        });
        if (validationErrors.length > 0) {
            toast.error("Please fill all required fields", {
                description: validationErrors.join("\n"),
            });
            return;
        }

        const payload = {
            type,
            name: String(values.name || ""),
            destinationId: destinationId || "",
            additionalFlags: values.additionalFlags?.map((flag) => flag.value) ?? [],
            ...getCredentialPayload(values, Boolean(destinationId)),
        };

        await mutateAsync(payload as never)
            .then(async () => {
                toast.success(`Destination ${destinationId ? "Updated" : "Created"}`);
                await utils.destination.all.invalidate();
                if (destinationId) {
                    await utils.destination.one.invalidate({ destinationId });
                }
                onOpenChange(false);
            })
            .catch((err) => {
                toast.error(
                    `Error ${destinationId ? "Updating" : "Creating"} the Destination`,
                    {
                        description: err.message,
                    },
                );
            });
    };

    const handleTestConnection = async (serverId?: string) => {
        const values = form.getValues();
        const validationErrors = getValidationErrors(values);
        if (validationErrors.length > 0) {
            toast.error("Please fill all required fields", {
                description: validationErrors.join("\n"),
            });
            return;
        }

        if (isCloud && !serverId) {
            toast.error("Please select a server");
            return;
        }

        const payload = {
            type,
            name: "Test",
            serverId,
            additionalFlags: values.additionalFlags?.map((flag) => flag.value) ?? [],
            ...getCredentialPayload(values, false),
        };

        await testConnection(payload as never)
            .then(() => {
                toast.success("Connection Success");
            })
            .catch((err) => {
                toast.error("Error connecting to provider", {
                    description: err.message,
                });
            });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{destinationId ? "Update" : "Add"} Destination</DialogTitle>
                    <DialogDescription>
                        In this section, you can configure and add new destinations for your
                        backups. Please ensure that you provide the correct information to
                        guarantee secure and efficient storage.
                    </DialogDescription>
                </DialogHeader>
                {(isError || isErrorConnection) && (
                    <AlertBlock type="error" className="w-full">
                        {connectionError?.message || error?.message}
                    </AlertBlock>
                )}

                <Form {...form}>
                    <form
                        id={`hook-form-destination-${type}`}
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="grid w-full gap-4"
                    >
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder={`${schema?.name ?? "Destination"} Target`} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {properties.map((property) => (
                            <FormField
                                key={property.name}
                                control={form.control}
                                name={property.name}
                                render={({ field }) => {
                                    const stringValue =
                                        typeof field.value === "string" ? field.value : "";

                                    return (
                                        <FormItem>
                                            <FormLabel>{property.label}</FormLabel>
                                            <FormControl>
                                                {property.type === "select" ? (
                                                    <Select
                                                        onValueChange={field.onChange}
                                                        defaultValue={stringValue}
                                                        value={stringValue}
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder={property.description} />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {(property.options ?? []).map(({key, name}) => (
                                                                <SelectItem key={key} value={key}>
                                                                    {name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                ) : (
                                                    <Input
                                                        type={
                                                            property.type === "password"
                                                                ? "password"
                                                                : property.type
                                                        }
                                                        placeholder={property.description}
                                                        {...field}
                                                        value={stringValue}
                                                    />
                                                )}
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    );
                                }}
                            />
                        ))}

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <FormLabel>Additional Flags (Optional)</FormLabel>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => append({ value: "" })}
                                >
                                    <PlusIcon className="size-4" />
                                    Add Flag
                                </Button>
                            </div>
                            {fields.map((entry, index) => (
                                <FormField
                                    key={entry.id}
                                    control={form.control}
                                    name={`additionalFlags.${index}.value`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <div className="flex items-center gap-2">
                                                <FormControl>
                                                    <Input
                                                        placeholder="--s3-sign-accept-encoding=false"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => remove(index)}
                                                >
                                                    <Trash2 className="size-4 text-muted-foreground" />
                                                </Button>
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            ))}
                        </div>
                    </form>

                    <DialogFooter
                        className={cn(
                            isCloud ? "!flex-col" : "flex-row",
                            "flex w-full !justify-between gap-4",
                        )}
                    >
                        {isCloud ? (
                            <div className="flex flex-col gap-4 border p-2 rounded-lg">
                                <span className="text-sm text-muted-foreground">
                                    Select a server to test the destination. If you do not have a
                                    server choose the default one.
                                </span>
                                <FormField
                                    control={form.control}
                                    name="serverId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Server (Optional)</FormLabel>
                                            <FormControl>
                                                <Select
                                                    onValueChange={field.onChange}
                                                    defaultValue={
                                                        typeof field.value === "string"
                                                            ? field.value
                                                            : undefined
                                                    }
                                                >
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue placeholder="Select a server" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectGroup>
                                                            <SelectLabel>Servers</SelectLabel>
                                                            {servers?.map((server) => (
                                                                <SelectItem
                                                                    key={server.serverId}
                                                                    value={server.serverId}
                                                                >
                                                                    {server.name}
                                                                </SelectItem>
                                                            ))}
                                                            <SelectItem value="none">None</SelectItem>
                                                        </SelectGroup>
                                                    </SelectContent>
                                                </Select>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Button
                                    type="button"
                                    variant="secondary"
                                    isLoading={isPendingConnection}
                                    onClick={async () => {
                                        const value = form.getValues("serverId");
                                        await handleTestConnection(
                                            typeof value === "string" ? value : undefined,
                                        );
                                    }}
                                >
                                    Test Connection
                                </Button>
                            </div>
                        ) : (
                            <Button
                                isLoading={isPendingConnection}
                                type="button"
                                variant="secondary"
                                onClick={async () => {
                                    await handleTestConnection();
                                }}
                            >
                                Test connection
                            </Button>
                        )}

                        <Button
                            isLoading={isPending}
                            form={`hook-form-destination-${type}`}
                            type="submit"
                        >
                            {destinationId ? "Update" : "Create"}
                        </Button>
                    </DialogFooter>
                </Form>
            </DialogContent>
        </Dialog>
    );
};
