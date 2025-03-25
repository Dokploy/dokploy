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
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { slugify } from "@/lib/slug";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircuitBoard, HelpCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const AddComposeSchema = z.object({
  composeType: z.enum(["docker-compose", "stack"]).optional(),
  name: z.string().min(1, {
    message: "Name is required",
  }),
  appName: z
    .string()
    .min(1, {
      message: "App name is required",
    })
    .regex(/^[a-z](?!.*--)([a-z0-9-]*[a-z])?$/, {
      message:
        "App name supports lowercase letters, numbers, '-' and can only start and end letters, and does not support continuous '-'",
    }),
  description: z.string().optional(),
  serverId: z.string().optional(),
});

type AddCompose = z.infer<typeof AddComposeSchema>;

interface Props {
  projectId: string;
  projectName?: string;
}

export const AddCompose = ({ projectId, projectName }: Props) => {
  const utils = api.useUtils();
  const [visible, setVisible] = useState(false);
  const [appNameLocked, setAppNameLocked] = useState(true);
  const slug = slugify(projectName);
  const { data: isCloud } = api.settings.isCloud.useQuery();
  const { data: servers } = api.server.withSSHKey.useQuery();
  const { mutateAsync, isLoading, error, isError } =
    api.compose.create.useMutation();

  const form = useForm<AddCompose>({
    defaultValues: {
      name: "",
      description: "",
      composeType: "docker-compose",
      appName: `${slug}-`,
    },
    resolver: zodResolver(AddComposeSchema),
  });

  const generateAppName = (value: string): string => {
    if (!value) return `${slug}-`;
    
    const processedValue = value.trim()
      .toLowerCase()
      // replace dots, spaces, and special characters with dashes
      .replace(/[^\w]+/g, '-')
      // remove any consecutive dashes
      .replace(/-+/g, '-')
      // remove leading/trailing dashes
      .replace(/^-+|-+$/g, '');
    
    return `${slug}-${processedValue}`;
  };

  useEffect(() => {
    form.reset();
  }, [form, form.reset, form.formState.isSubmitSuccessful]);

  const onSubmit = async (data: AddCompose) => {
    await mutateAsync({
      name: data.name,
      description: data.description,
      projectId,
      composeType: data.composeType,
      appName: data.appName,
      serverId: data.serverId,
    })
      .then(async () => {
        toast.success("Compose Created");
        setVisible(false);
        await utils.project.one.invalidate({
          projectId,
        });
      })
      .catch(() => {
        toast.error("Error creating the compose");
      });
  };

  return (
    <Dialog open={visible} onOpenChange={setVisible}>
      <DialogTrigger className="w-full">
        <DropdownMenuItem
          className="w-full cursor-pointer space-x-3"
          onSelect={(e) => e.preventDefault()}
        >
          <CircuitBoard className="size-4 text-muted-foreground" />
          <span>Compose</span>
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent className="max-h-screen  overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create Compose</DialogTitle>
          <DialogDescription>
            Assign a name and description to your compose
          </DialogDescription>
        </DialogHeader>
        {isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

        <Form {...form}>
          <form
            id="hook-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid w-full gap-4"
          >
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Frontend"
                        {...field}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        onChange={(e) => {
                          const val = e.target.value;
                          field.onChange(val);
                          
                          // Auto-generate App Name if locked
                          if (appNameLocked && val) {
                            form.setValue("appName", generateAppName(val));
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="appName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>App Name</FormLabel>
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="relative w-full">
                          <FormControl>
                            <Input
                              placeholder="project-frontend"
                              {...field}
                              readOnly={appNameLocked}
                              className={appNameLocked ? "cursor-pointer opacity-70 pr-10" : ""}
                              onClick={() => {
                                if (appNameLocked) {
                                  setAppNameLocked(false);
                                }
                              }}
                            />
                          </FormControl>
                          {appNameLocked && (
                            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                              <HelpCircle className="size-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent 
                        side="top" 
                        className="z-[999] min-w-[180px] max-w-[250px] p-2 text-xs"
                        sideOffset={5}
                        avoidCollisions
                      >
                        {appNameLocked
                          ? "App name is auto-generated. Click to edit manually."
                          : "App name can be edited manually."}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="serverId"
              render={({ field }) => (
                <FormItem>
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <FormLabel className="break-all w-fit flex flex-row gap-1 items-center">
                          Select a Server {!isCloud ? "(Optional)" : ""}
                          <HelpCircle className="size-4 text-muted-foreground" />
                        </FormLabel>
                      </TooltipTrigger>
                      <TooltipContent
                        className="z-[999] w-[300px]"
                        align="start"
                        side="top"
                        avoidCollisions
                      >
                        <span>
                          If no server is selected, the application will be
                          deployed on the server where the user is logged in.
                        </span>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a Server" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {servers?.map((server) => (
                          <SelectItem
                            key={server.serverId}
                            value={server.serverId}
                          >
                            <span className="flex items-center gap-2 justify-between w-full">
                              <span>{server.name}</span>
                              <span className="text-muted-foreground text-xs self-center">
                                {server.ipAddress}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                        <SelectLabel>Servers ({servers?.length})</SelectLabel>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="composeType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Compose Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a compose type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="docker-compose">
                        Docker Compose
                      </SelectItem>
                      <SelectItem value="stack">Stack</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Description of your service..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />
          </form>

          <DialogFooter>
            <Button isLoading={isLoading} form="hook-form" type="submit">
              Create
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
