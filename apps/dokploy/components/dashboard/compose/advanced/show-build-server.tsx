import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Server } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

interface Props {
  composeId: string;
}

const schema = z.object({
  buildServerId: z.string().optional(),
});

type Schema = z.infer<typeof schema>;

export const ShowBuildServerCompose = ({ composeId }: Props) => {
  const { data, refetch } = api.compose.one.useQuery(
    { composeId },
    { enabled: !!composeId },
  );
  const { data: buildServers } = api.server.buildServers.useQuery();
  const { mutateAsync, isPending } = api.compose.update.useMutation();

  const form = useForm<Schema>({
    defaultValues: {
      buildServerId: data?.buildServerId || "",
    },
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (data) {
      form.reset({
        buildServerId: data.buildServerId || "",
      });
    }
  }, [data, form, form.reset]);

  const onSubmit = async (formData: Schema) => {
    await mutateAsync({
      composeId,
      buildServerId:
        formData.buildServerId === "none" || !formData.buildServerId
          ? null
          : formData.buildServerId,
    })
      .then(async () => {
        toast.success("Build Server Settings Updated");
        await refetch();
      })
      .catch(() => {
        toast.error("Error updating build server settings");
      });
  };

  return (
    <Card className="bg-background">
      <CardHeader>
        <div className="flex flex-row items-center gap-2">
          <Server className="size-6 text-muted-foreground" />
          <div>
            <CardTitle className="text-xl">Build Server</CardTitle>
            <CardDescription>
              Configure an optional dedicated server for compose deployments.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AlertBlock type="info">
          When a build server is selected, clone/build/deploy commands run on
          that server.
        </AlertBlock>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid w-full gap-4"
          >
            <FormField
              control={form.control}
              name="buildServerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Build Server</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || "none"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a build server" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="none">None</SelectItem>
                        {buildServers?.map((server) => (
                          <SelectItem
                            key={server.serverId}
                            value={server.serverId}
                          >
                            <span className="flex items-center justify-between w-full gap-2">
                              <span>{server.name}</span>
                              <span className="text-muted-foreground text-xs">
                                {server.ipAddress}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Select where compose deployment commands should run.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex w-full justify-end">
              <Button isLoading={isPending} type="submit">
                Save Build Server
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};
