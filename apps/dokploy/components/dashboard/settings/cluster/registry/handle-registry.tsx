import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  PenBoxIcon,
  PlusIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

const AWS_REGIONS = [
  "af-south-1",
  "ap-east-1",
  "ap-east-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-northeast-3",
  "ap-south-1",
  "ap-south-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-southeast-3",
  "ap-southeast-4",
  "ap-southeast-5",
  "ap-southeast-6",
  "ap-southeast-7",
  "ca-central-1",
  "ca-west-1",
  "eu-central-1",
  "eu-central-2",
  "eu-north-1",
  "eu-south-1",
  "eu-south-2",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "il-central-1",
  "me-central-1",
  "me-south-1",
  "mx-central-1",
  "sa-east-1",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
];

interface AwsRegionComboboxProps {
  value: string;
  onChange: (value: string) => void;
}

const AwsRegionCombobox = ({ value, onChange }: AwsRegionComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value || "Select a region"}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput
            placeholder="Search region..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {search.trim() ? (
                <CommandItem
                  value={search.trim()}
                  onSelect={() => {
                    onChange(search.trim());
                    setSearch("");
                    setOpen(false);
                  }}
                  className="justify-center"
                >
                  Use &quot;{search.trim()}&quot;
                </CommandItem>
              ) : (
                "No region found."
              )}
            </CommandEmpty>
            <CommandGroup>
              {AWS_REGIONS.map((region) => (
                <CommandItem
                  key={region}
                  value={region}
                  onSelect={(selected) => {
                    onChange(selected === value ? "" : selected);
                    setSearch("");
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${value === region ? "opacity-100" : "opacity-0"}`}
                  />
                  {region}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const isNonEmptyString = (s: unknown): s is string =>
  typeof s === "string" && s.trim().length > 0;

const AddRegistrySchema = z
  .object({
    registryName: z.string().min(1, {
      message: "Registry name is required",
    }),
    registryType: z.enum(["cloud", "awsEcr"], {
      message: "Registry type is required",
    }),
    username: z.string().optional(),
    password: z.string().optional(),
    registryUrl: z
      .string()
      .optional()
      .refine(
        (val) => {
          // If empty or undefined, skip validation (field is optional)
          if (!val || val.trim().length === 0) {
            return true;
          }
          // Validate that it's a valid hostname (no protocol, no path, optional port)
          // Valid formats: example.com, registry.example.com, [::1], example.com:5000
          // Invalid: https://example.com, example.com/path
          const trimmed = val.trim();
          // Check for protocol or path - these are not allowed
          if (/^https?:\/\//i.test(trimmed) || trimmed.includes("/")) {
            return false;
          }
          // Basic hostname validation: allow alphanumeric, dots, hyphens, underscores, and IPv6 in brackets
          // Allow optional port at the end
          const hostnameRegex =
            /^(?:\[[^\]]+\]|[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,253}[a-zA-Z0-9])?)(?::\d+)?$/;
          return hostnameRegex.test(trimmed);
        },
        {
          message:
            "Invalid registry URL. Please enter only the hostname (e.g., example.com or registry.example.com). Do not include protocol (https://) or paths.",
        },
      ),
    imagePrefix: z.string(),
    serverId: z.string().optional(),
    isEditing: z.boolean().optional(),
    // AWS ECR specific fields
    awsAccessKeyId: z.string().optional(),
    awsSecretAccessKey: z.string().optional(),
    awsRegion: z.string().optional(),
    awsAccountId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.registryType === "awsEcr") {
      const { awsAccessKeyId, awsSecretAccessKey, awsRegion, awsAccountId } =
        data;
      if (!isNonEmptyString(awsAccessKeyId)) {
        ctx.addIssue({
          code: "custom",
          message: "AWS Access Key ID is required",
          path: ["awsAccessKeyId"],
        });
      }
      if (!data.isEditing && !isNonEmptyString(awsSecretAccessKey)) {
        ctx.addIssue({
          code: "custom",
          message: "AWS Secret Access Key is required",
          path: ["awsSecretAccessKey"],
        });
      }
      if (!isNonEmptyString(awsRegion)) {
        ctx.addIssue({
          code: "custom",
          message: "AWS Region is required",
          path: ["awsRegion"],
        });
      }
      if (!awsAccountId || !/^\d{12}$/.test(awsAccountId)) {
        ctx.addIssue({
          code: "custom",
          message: "AWS Account ID must be exactly 12 digits",
          path: ["awsAccountId"],
        });
      }
    } else {
      // For regular registries, require username and password
      if (!isNonEmptyString(data.username)) {
        ctx.addIssue({
          code: "custom",
          message: "Username is required",
          path: ["username"],
        });
      }
      // Password required when creating; optional when editing (keep existing)
      if (!data.isEditing && !isNonEmptyString(data.password)) {
        ctx.addIssue({
          code: "custom",
          message: "Password is required",
          path: ["password"],
        });
      }
    }
  });

type AddRegistry = z.infer<typeof AddRegistrySchema>;

interface Props {
  registryId?: string;
}

export const HandleRegistry = ({ registryId }: Props) => {
  const utils = api.useUtils();
  const [isOpen, setIsOpen] = useState(false);

  const { data: registry } = api.registry.one.useQuery(
    {
      registryId: registryId || "",
    },
    {
      enabled: !!registryId,
    },
  );

  const { data: isCloud } = api.settings.isCloud.useQuery();

  const { mutateAsync, error, isError } = registryId
    ? api.registry.update.useMutation()
    : api.registry.create.useMutation();
  const { data: deployServers } = api.server.withSSHKey.useQuery();
  const { data: buildServers } = api.server.buildServers.useQuery();
  const servers = [...(deployServers || []), ...(buildServers || [])];
  const {
    mutateAsync: testRegistry,
    isPending,
    error: testRegistryError,
    isError: testRegistryIsError,
  } = api.registry.testRegistry.useMutation();
  const {
    mutateAsync: testRegistryById,
    isPending: isPendingById,
    error: testRegistryByIdError,
    isError: testRegistryByIdIsError,
  } = api.registry.testRegistryById.useMutation();
  const form = useForm<AddRegistry>({
    defaultValues: {
      registryType: "cloud",
      username: "",
      password: "",
      registryUrl: "",
      imagePrefix: "",
      registryName: "",
      serverId: "",
      isEditing: !!registryId,
      awsAccessKeyId: "",
      awsSecretAccessKey: "",
      awsRegion: "",
      awsAccountId: "",
    },
    resolver: zodResolver(AddRegistrySchema),
  });

  const password = form.watch("password");
  const username = form.watch("username");
  const registryUrl = form.watch("registryUrl");
  const registryName = form.watch("registryName");
  const imagePrefix = form.watch("imagePrefix");
  const serverId = form.watch("serverId");
  const registryType = form.watch("registryType");
  const awsAccessKeyId = form.watch("awsAccessKeyId");
  const awsSecretAccessKey = form.watch("awsSecretAccessKey");
  const awsRegion = form.watch("awsRegion");
  const awsAccountId = form.watch("awsAccountId");
  const computedEcrUrl =
    awsAccountId && awsRegion
      ? `${awsAccountId}.dkr.ecr.${awsRegion}.amazonaws.com`
      : null;
  const selectedServer = servers?.find(
    (server) => server.serverId === serverId,
  );

  useEffect(() => {
    if (registry) {
      const parsedAccountId =
        registry.registryType === "awsEcr"
          ? (registry.registryUrl?.split(".dkr.ecr.")[0] ?? "")
          : "";
      form.reset({
        registryType:
          registry.registryType === "selfHosted"
            ? "cloud"
            : registry.registryType,
        username: registry.username || "",
        password: "",
        registryUrl: registry.registryUrl,
        imagePrefix: registry.imagePrefix || "",
        registryName: registry.registryName,
        isEditing: true,
        awsAccessKeyId: registry.awsAccessKeyId || "",
        awsSecretAccessKey: "",
        awsRegion: registry.awsRegion || "",
        awsAccountId: parsedAccountId,
      });
    } else {
      form.reset({
        registryType: "cloud",
        username: "",
        password: "",
        registryUrl: "",
        imagePrefix: "",
        serverId: "",
        isEditing: false,
        awsAccessKeyId: "",
        awsSecretAccessKey: "",
        awsRegion: "",
        awsAccountId: "",
      });
    }
  }, [form, form.reset, form.formState.isSubmitSuccessful, registry]);

  const onSubmit = async (data: AddRegistry) => {
    const resolvedRegistryUrl =
      data.registryType === "awsEcr"
        ? `${data.awsAccountId}.dkr.ecr.${data.awsRegion}.amazonaws.com`
        : data.registryUrl || "";

    const payload: any = {
      registryName: data.registryName,
      username: data.username || "",
      registryUrl: resolvedRegistryUrl,
      registryType: data.registryType,
      imagePrefix: data.imagePrefix,
      serverId: data.serverId,
      registryId: registryId || "",
      awsAccessKeyId: data.awsAccessKeyId || "",
      awsRegion: data.awsRegion || "",
    };

    // Only include password if it's been provided (not empty)
    // When editing, empty password means "keep the existing password"
    if (data.password && data.password.length > 0) {
      payload.password = data.password;
    }

    // Same guard for the AWS secret key — omit when blank so the stored
    // value is not overwritten during an edit where the field was left empty
    if (data.awsSecretAccessKey && data.awsSecretAccessKey.length > 0) {
      payload.awsSecretAccessKey = data.awsSecretAccessKey;
    }

    await mutateAsync(payload)
      .then(async (_data) => {
        await utils.registry.all.invalidate();
        toast.success(registryId ? "Registry updated" : "Registry added");
        setIsOpen(false);
      })
      .catch(() => {
        toast.error(
          registryId ? "Error updating a registry" : "Error adding a registry",
        );
      });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {registryId ? (
          <Button
            variant="ghost"
            size="icon"
            className="group hover:bg-blue-500/10 "
          >
            <PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
          </Button>
        ) : (
          <Button className="cursor-pointer space-x-3">
            <PlusIcon className="h-4 w-4" />
            Add Registry
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a external registry</DialogTitle>
          <DialogDescription>
            Fill the next fields to add a external registry.
          </DialogDescription>
        </DialogHeader>
        {(isError || testRegistryIsError || testRegistryByIdIsError) && (
          <div className="flex flex-row gap-4 rounded-lg bg-red-50 p-2 dark:bg-red-950">
            <AlertTriangle className="text-red-600 dark:text-red-400" />
            <span className="text-sm text-red-600 dark:text-red-400">
              {testRegistryError?.message ||
                testRegistryByIdError?.message ||
                error?.message ||
                ""}
            </span>
          </div>
        )}
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid grid-cols-1 sm:grid-cols-2 w-full gap-4"
          >
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="registryName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Registry Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Registry Name" {...field} />
                    </FormControl>

                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="registryType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Registry Type</FormLabel>
                    <FormControl>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select registry type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Registry Types</SelectLabel>
                            <SelectItem value="cloud">
                              Generic Registry
                            </SelectItem>
                            <SelectItem value="awsEcr">AWS ECR</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {registryType === "cloud" && (
              <>
                <div className="flex flex-col gap-4">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Username"
                            autoComplete="username"
                            {...field}
                          />
                        </FormControl>

                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex flex-col gap-4">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Password{registryId && " (Optional)"}
                        </FormLabel>
                        {registryId && (
                          <FormDescription>
                            Leave blank to keep existing password. Enter new
                            password to test or update it.
                          </FormDescription>
                        )}
                        <FormControl>
                          <Input
                            placeholder={
                              registryId
                                ? "Leave blank to keep existing"
                                : "Password"
                            }
                            autoComplete="one-time-code"
                            {...field}
                            type="password"
                          />
                        </FormControl>

                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}
            {registryType === "awsEcr" && (
              <>
                <div className="flex flex-col gap-4">
                  <FormField
                    control={form.control}
                    name="awsAccessKeyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>AWS Access Key ID</FormLabel>
                        <FormControl>
                          <Input placeholder="Your access key ID" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex flex-col gap-4">
                  <FormField
                    control={form.control}
                    name="awsSecretAccessKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          AWS Secret Access Key
                          {registryId && " (Optional)"}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={
                              registryId
                                ? "Leave blank to keep existing"
                                : "Your secret access key"
                            }
                            type="password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex flex-col gap-4">
                  <FormField
                    control={form.control}
                    name="awsAccountId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>AWS Account ID</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="123456789012"
                            maxLength={12}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex flex-col gap-4">
                  <FormField
                    control={form.control}
                    name="awsRegion"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>AWS Region</FormLabel>
                        <FormControl>
                          <AwsRegionCombobox
                            value={field.value || ""}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="col-span-2 rounded-md bg-muted px-3 py-2">
                  <p className="text-xs text-muted-foreground mb-1">
                    Registry URL
                  </p>
                  <code className="text-sm">
                    <span
                      className={awsAccountId ? "" : "text-muted-foreground"}
                    >
                      {awsAccountId || "<ACCOUNT_ID>"}
                    </span>
                    {".dkr.ecr."}
                    <span className={awsRegion ? "" : "text-muted-foreground"}>
                      {awsRegion || "<REGION>"}
                    </span>
                    {".amazonaws.com"}
                  </code>
                </div>
              </>
            )}
            {registryType === "cloud" && (
              <div className="flex flex-col gap-4">
                <FormField
                  control={form.control}
                  name="imagePrefix"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Image Prefix</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Image Prefix" />
                      </FormControl>

                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
            {registryType === "cloud" && (
              <div className="flex flex-col gap-4  col-span-2">
                <FormField
                  control={form.control}
                  name="registryUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Registry URL</FormLabel>
                      <FormDescription>
                        Enter only the hostname (e.g., registry.example.com).
                      </FormDescription>
                      <FormControl>
                        <Input placeholder="registry.example.com" {...field} />
                      </FormControl>

                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="col-span-2">
              <FormField
                control={form.control}
                name="serverId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Server {!isCloud && "(Optional)"}</FormLabel>
                    <FormDescription>
                      {!isCloud ? (
                        <>
                          {serverId && serverId !== "none" && selectedServer ? (
                            <>
                              Authentication will be performed on{" "}
                              <strong>{selectedServer.name}</strong>. This
                              registry will be available on this server.
                            </>
                          ) : (
                            <>
                              Choose where to authenticate with the registry. By
                              default, authentication occurs on the Dokploy
                              server. Select a specific server to authenticate
                              from that server instead.
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          {serverId && serverId !== "none" && selectedServer ? (
                            <>
                              Authentication will be performed on{" "}
                              <strong>{selectedServer.name}</strong>. This
                              registry will be available on this server.
                            </>
                          ) : (
                            <>
                              Select a server to authenticate with the registry.
                              The authentication will be performed from the
                              selected server.
                            </>
                          )}
                        </>
                      )}
                    </FormDescription>
                    <FormControl>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a server" />
                        </SelectTrigger>
                        <SelectContent>
                          {deployServers && deployServers.length > 0 && (
                            <SelectGroup>
                              <SelectLabel>Deploy Servers</SelectLabel>
                              {deployServers.map((server) => (
                                <SelectItem
                                  key={server.serverId}
                                  value={server.serverId}
                                >
                                  {server.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                          {buildServers && buildServers.length > 0 && (
                            <SelectGroup>
                              <SelectLabel>Build Servers</SelectLabel>
                              {buildServers.map((server) => (
                                <SelectItem
                                  key={server.serverId}
                                  value={server.serverId}
                                >
                                  {server.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                          <SelectGroup>
                            <SelectItem value={"none"}>None</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </FormControl>

                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="flex flex-col w-full sm:justify-between gap-4 flex-wrap sm:flex-col col-span-2">
              <div className="flex flex-row gap-2 justify-between">
                <Button
                  type="button"
                  variant={"secondary"}
                  isLoading={isPending || isPendingById}
                  onClick={async () => {
                    // For ECR: when editing with empty secret, use stored credentials
                    if (
                      registryType === "awsEcr" &&
                      registryId &&
                      (!awsSecretAccessKey || awsSecretAccessKey.length === 0)
                    ) {
                      await testRegistryById({
                        registryId: registryId || "",
                        ...(serverId && { serverId }),
                      })
                        .then((data) => {
                          if (data) {
                            toast.success("Registry Tested Successfully");
                          } else {
                            toast.error("Registry Test Failed");
                          }
                        })
                        .catch(() => {
                          toast.error("Error testing the registry");
                        });
                      return;
                    }

                    // For cloud: when editing with empty password, use the existing password from DB
                    if (
                      registryType === "cloud" &&
                      registryId &&
                      (!password || password.length === 0)
                    ) {
                      await testRegistryById({
                        registryId: registryId || "",
                        ...(serverId && { serverId }),
                      })
                        .then((data) => {
                          if (data) {
                            toast.success("Registry Tested Successfully");
                          } else {
                            toast.error("Registry Test Failed");
                          }
                        })
                        .catch(() => {
                          toast.error("Error testing the registry");
                        });
                      return;
                    }

                    // When creating cloud, password is required
                    if (
                      !registryId &&
                      registryType === "cloud" &&
                      (!password || password.length === 0)
                    ) {
                      form.setError("password", {
                        type: "manual",
                        message: "Password is required",
                      });
                      return;
                    }

                    // Validate and test with provided credentials
                    const validationResult = AddRegistrySchema.safeParse({
                      registryType,
                      username,
                      password,
                      registryUrl,
                      registryName: "Dokploy Registry",
                      imagePrefix,
                      serverId,
                      isEditing: !!registryId,
                      awsAccessKeyId,
                      awsSecretAccessKey,
                      awsRegion,
                      awsAccountId,
                    });

                    if (!validationResult.success) {
                      for (const issue of validationResult.error.issues) {
                        form.setError(issue.path[0] as any, {
                          type: "manual",
                          message: issue.message,
                        });
                      }
                      return;
                    }

                    await testRegistry({
                      username: username || "",
                      password: password || "",
                      registryUrl:
                        registryType === "awsEcr"
                          ? (computedEcrUrl ?? "")
                          : registryUrl || "",
                      registryName: registryName,
                      registryType: registryType,
                      imagePrefix: imagePrefix,
                      serverId: serverId,
                      awsAccessKeyId: awsAccessKeyId,
                      awsSecretAccessKey: awsSecretAccessKey,
                      awsRegion: awsRegion,
                    })
                      .then((data) => {
                        if (data) {
                          toast.success("Registry Tested Successfully");
                        } else {
                          toast.error("Registry Test Failed");
                        }
                      })
                      .catch(() => {
                        toast.error("Error testing the registry");
                      });
                  }}
                >
                  Test Registry
                </Button>
                <Button isLoading={form.formState.isSubmitting} type="submit">
                  {registryId ? "Update" : "Create"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
