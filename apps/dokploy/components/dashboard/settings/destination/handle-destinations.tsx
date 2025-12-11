import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect, useMemo, useState } from "react";
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

import { S3_PROVIDERS } from "./constants";

const createDestinationSchema = (t: (key: string) => string) =>
  z.object({
    name: z
      .string()
      .min(1, t("settings.destinations.validation.nameRequired")),
    provider: z
      .string()
      .min(1, t("settings.destinations.validation.providerRequired")),
    accessKeyId: z
      .string()
      .min(1, t("settings.destinations.validation.accessKeyIdRequired")),
    secretAccessKey: z
      .string()
      .min(
        1,
        t("settings.destinations.validation.secretAccessKeyRequired"),
      ),
    bucket: z
      .string()
      .min(1, t("settings.destinations.validation.bucketRequired")),
    region: z.string(),
    endpoint: z
      .string()
      .min(1, t("settings.destinations.validation.endpointRequired")),
    serverId: z.string().optional(),
  });

type AddDestination = z.infer<ReturnType<typeof createDestinationSchema>>;

interface Props {
  destinationId?: string;
}

export const HandleDestinations = ({ destinationId }: Props) => {
  const { t } = useTranslation("settings");
  const schema = useMemo(() => createDestinationSchema(t), [t]);

  const [open, setOpen] = useState(false);

  const utils = api.useUtils();
  const { data: servers } = api.server.withSSHKey.useQuery();
  const { data: isCloud } = api.settings.isCloud.useQuery();

  const { mutateAsync, isError, error, isLoading } = destinationId
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
    isLoading: isLoadingConnection,
    error: connectionError,
    isError: isErrorConnection,
  } = api.destination.testConnection.useMutation();

  const form = useForm<AddDestination>({
    defaultValues: {
      name: "",
      provider: "",
      accessKeyId: "",
      secretAccessKey: "",
      bucket: "",
      region: "",
      endpoint: "",
      serverId: undefined,
    },
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (destination) {
      form.reset({
        name: destination.name,
        provider: destination.provider || "",
        accessKeyId: destination.accessKey,
        secretAccessKey: destination.secretAccessKey,
        bucket: destination.bucket,
        region: destination.region,
        endpoint: destination.endpoint,
        serverId: undefined,
      });
    } else {
      form.reset();
    }
  }, [destination, form]);

  const onSubmit = async (data: AddDestination) => {
    try {
      await mutateAsync({
        provider: data.provider || "",
        accessKey: data.accessKeyId,
        bucket: data.bucket,
        endpoint: data.endpoint,
        name: data.name,
        region: data.region,
        secretAccessKey: data.secretAccessKey,
        destinationId: destinationId || "",
      });

      toast.success(
        destinationId
          ? t("settings.destinations.toast.updated")
          : t("settings.destinations.toast.created"),
      );

      await utils.destination.all.invalidate();
      setOpen(false);
    } catch {
      toast.error(t("settings.destinations.toast.saveError"));
    }
  };

  const handleTestConnection = async (serverId?: string) => {
    const result = await form.trigger([
      "provider",
      "accessKeyId",
      "secretAccessKey",
      "bucket",
      "endpoint",
    ]);

    if (!result) {
      const errors = form.formState.errors;
      const errorFields = Object.entries(errors)
        .map(([field, fieldError]) => `${field}: ${fieldError?.message ?? ""}`)
        .filter((value) => Boolean(value.trim()))
        .join("\n");

      toast.error(t("settings.destinations.test.validationError"), {
        description: errorFields,
      });
      return;
    }

    if (isCloud && !serverId) {
      toast.error(t("settings.destinations.test.serverRequired"));
      return;
    }

    const provider = form.getValues("provider");
    const accessKey = form.getValues("accessKeyId");
    const secretKey = form.getValues("secretAccessKey");
    const bucket = form.getValues("bucket");
    const endpoint = form.getValues("endpoint");
    const region = form.getValues("region");

    const connectionString = `:s3,provider=${provider},access_key_id=${accessKey},secret_access_key=${secretKey},endpoint=${endpoint}${
      region ? `,region=${region}` : ""
    }:${bucket}`;

    try {
      await testConnection({
        provider,
        accessKey,
        bucket,
        endpoint,
        name: "Test",
        region,
        secretAccessKey: secretKey,
        serverId,
      });

      toast.success(t("settings.destinations.test.success"));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { message?: string } | undefined)?.message ?? "";

      toast.error(t("settings.destinations.test.errorTitle"), {
        description: t("settings.destinations.test.errorDescription", {
          message,
          connectionString,
        }),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild className="">
        {destinationId ? (
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
            {t("settings.destinations.button.add")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {destinationId
              ? t("settings.destinations.dialog.updateTitle")
              : t("settings.destinations.dialog.addTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("settings.destinations.dialog.description")}
          </DialogDescription>
        </DialogHeader>

        {(isError || isErrorConnection) && (
          <AlertBlock type="error" className="w-full">
            {connectionError?.message || error?.message}
          </AlertBlock>
        )}

        <Form {...form}>
          <form
            id="hook-form-destination-add"
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid w-full gap-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("settings.destinations.form.name.label")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t(
                        "settings.destinations.form.name.placeholder",
                      )}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="provider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("settings.destinations.form.provider.label")}
                  </FormLabel>
                  <FormControl>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t(
                              "settings.destinations.form.provider.placeholder",
                            )}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {S3_PROVIDERS.map((s3Provider) => (
                          <SelectItem
                            key={s3Provider.key}
                            value={s3Provider.key}
                          >
                            {s3Provider.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="accessKeyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("settings.destinations.form.accessKeyId.label")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t(
                        "settings.destinations.form.accessKeyId.placeholder",
                      )}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="secretAccessKey"
              render={({ field }) => (
                <FormItem>
                  <div className="space-y-0.5">
                    <FormLabel>
                      {t("settings.destinations.form.secretAccessKey.label")}
                    </FormLabel>
                  </div>
                  <FormControl>
                    <Input
                      placeholder={t(
                        "settings.destinations.form.secretAccessKey.placeholder",
                      )}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bucket"
              render={({ field }) => (
                <FormItem>
                  <div className="space-y-0.5">
                    <FormLabel>
                      {t("settings.destinations.form.bucket.label")}
                    </FormLabel>
                  </div>
                  <FormControl>
                    <Input
                      placeholder={t(
                        "settings.destinations.form.bucket.placeholder",
                      )}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="region"
              render={({ field }) => (
                <FormItem>
                  <div className="space-y-0.5">
                    <FormLabel>
                      {t("settings.destinations.form.region.label")}
                    </FormLabel>
                  </div>
                  <FormControl>
                    <Input
                      placeholder={t(
                        "settings.destinations.form.region.placeholder",
                      )}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endpoint"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("settings.destinations.form.endpoint.label")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t(
                        "settings.destinations.form.endpoint.placeholder",
                      )}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>

          <DialogFooter
            className={cn(
              isCloud ? "!flex-col" : "flex-row",
              "flex w-full  !justify-between gap-4",
            )}
          >
            {isCloud ? (
              <div className="flex flex-col gap-4 border p-2 rounded-lg">
                <span className="text-sm text-muted-foreground">
                  {t("settings.destinations.test.cloudHelp")}
                </span>

                <FormField
                  control={form.control}
                  name="serverId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("settings.destinations.form.server.label")}
                      </FormLabel>
                      <FormControl>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue
                              placeholder={t(
                                "settings.destinations.form.server.placeholder",
                              )}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectLabel>
                                {t(
                                  "settings.destinations.form.server.listLabel",
                                )}
                              </SelectLabel>
                              {servers?.map((server) => (
                                <SelectItem
                                  key={server.serverId}
                                  value={server.serverId}
                                >
                                  {server.name}
                                </SelectItem>
                              ))}
                              <SelectItem value="none">
                                {t("settings.destinations.form.server.none")}
                              </SelectItem>
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
                  isLoading={isLoadingConnection}
                  onClick={async () => {
                    await handleTestConnection(form.getValues("serverId"));
                  }}
                >
                  {t("settings.destinations.button.testConnection")}
                </Button>
              </div>
            ) : (
              <Button
                isLoading={isLoadingConnection}
                type="button"
                variant="secondary"
                onClick={async () => {
                  await handleTestConnection();
                }}
              >
                {t("settings.destinations.button.testConnection")}
              </Button>
            )}

            <Button
              isLoading={isLoading}
              form="hook-form-destination-add"
              type="submit"
            >
              {destinationId
                ? t("settings.destinations.button.submit.update")
                : t("settings.destinations.button.submit.create")}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
