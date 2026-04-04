import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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

const EcrProviderSchema = z.object({
  registryId: z.string().min(1, { message: "Registry is required" }),
  ecrRepo: z.string().min(1, { message: "Repository is required" }),
  ecrTag: z.string().optional(),
});

type EcrProvider = z.infer<typeof EcrProviderSchema>;

interface Props {
  applicationId: string;
}

export const SaveEcrProvider = ({ applicationId }: Props) => {
  const { data, refetch } = api.application.one.useQuery({ applicationId });
  const { data: registries } = api.registry.all.useQuery();
  const { mutateAsync } = api.application.saveDockerProvider.useMutation();

  const [repoOpen, setRepoOpen] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");
  const [tagOpen, setTagOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");

  const ecrRegistries = registries?.filter((r) => r.registryType === "awsEcr");

  const savedRegistry = registries?.find(
    (r) => r.registryId === data?.registryId,
  );
  const withoutHost =
    savedRegistry?.registryUrl && data?.dockerImage
      ? data.dockerImage.replace(`${savedRegistry.registryUrl}/`, "")
      : (data?.dockerImage ?? "");
  const colonIdx = withoutHost.indexOf(":");
  const savedRepo =
    colonIdx >= 0 ? withoutHost.slice(0, colonIdx) : withoutHost;
  const savedTag = colonIdx >= 0 ? withoutHost.slice(colonIdx + 1) : "";

  const form = useForm<EcrProvider>({
    resolver: standardSchemaResolver(EcrProviderSchema),
    values: {
      registryId: data?.registryId ?? "",
      ecrRepo: savedRepo,
      ecrTag: savedTag,
    },
  });

  const registryId = form.watch("registryId");
  const ecrRepo = form.watch("ecrRepo");
  const selectedRegistry = ecrRegistries?.find(
    (r) => r.registryId === registryId,
  );

  useEffect(() => {
    const subscription = form.watch((_, { name }) => {
      if (name === "registryId") {
        form.setValue("ecrRepo", "");
        form.setValue("ecrTag", "");
      } else if (name === "ecrRepo") {
        form.setValue("ecrTag", "");
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const { data: ecrRepos, isLoading: ecrReposLoading } =
    api.registry.listECRRepositories.useQuery(
      { registryId },
      { enabled: !!registryId },
    );

  const { data: ecrTags, isLoading: ecrTagsLoading } =
    api.registry.listECRImageTags.useQuery(
      { registryId, repositoryName: ecrRepo ?? "" },
      { enabled: !!registryId && !!ecrRepo },
    );

  const handleSubmit = async (values: EcrProvider) => {
    const tag = values.ecrTag || "latest";
    const resolvedImage = selectedRegistry?.registryUrl
      ? `${selectedRegistry.registryUrl}/${values.ecrRepo}:${tag}`
      : `${values.ecrRepo}:${tag}`;

    await mutateAsync({
      dockerImage: resolvedImage,
      applicationId,
      registryId: values.registryId,
      username: null,
      password: null,
      registryUrl: null,
    })
      .then(async () => {
        toast.success("Docker Provider Saved");
        await refetch();
      })
      .catch(() => {
        toast.error("Error saving the Docker provider");
      });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="flex flex-col gap-4"
      >
        <FormField
          control={form.control}
          name="registryId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Step 1 — ECR Registry</FormLabel>
              <FormControl>
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an ECR registry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {ecrRegistries && ecrRegistries.length > 0 && (
                        <>
                          <SelectLabel>ECR Registries</SelectLabel>
                          {ecrRegistries.map((registry) => (
                            <SelectItem
                              key={registry.registryId}
                              value={registry.registryId}
                            >
                              {registry.registryName}
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FormControl>
              {selectedRegistry?.registryUrl && (
                <FormDescription>
                  Will be pulled from {selectedRegistry.registryUrl}
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="ecrRepo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Step 2 — Repository</FormLabel>
                <FormControl>
                  <Popover
                    open={repoOpen}
                    onOpenChange={(o) => {
                      if (registryId) setRepoOpen(o);
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        aria-expanded={repoOpen}
                        disabled={!registryId}
                        className="w-full justify-between font-normal"
                      >
                        {field.value ||
                          (registryId
                            ? "Search repositories..."
                            : "Select a registry first")}
                        {ecrReposLoading ? (
                          <Loader2 className="ml-2 h-4 w-4 animate-spin opacity-50" />
                        ) : (
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command>
                        <CommandInput
                          placeholder="Search repository..."
                          value={repoSearch}
                          onValueChange={setRepoSearch}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {ecrReposLoading ? (
                              <span className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading...
                              </span>
                            ) : (
                              "No repositories found."
                            )}
                          </CommandEmpty>
                          {repoSearch.trim() && (
                            <CommandGroup>
                              <CommandItem
                                value={repoSearch.trim()}
                                onSelect={() => {
                                  field.onChange(repoSearch.trim());
                                  setRepoSearch("");
                                  setRepoOpen(false);
                                }}
                                className="justify-center"
                              >
                                Use &quot;{repoSearch.trim()}&quot;
                              </CommandItem>
                            </CommandGroup>
                          )}
                          {ecrRepos && ecrRepos.length > 0 && (
                            <CommandGroup>
                              {ecrRepos.map((repo) => (
                                <CommandItem
                                  key={repo}
                                  value={repo}
                                  onSelect={(selected) => {
                                    field.onChange(selected);
                                    setRepoSearch("");
                                    setRepoOpen(false);
                                  }}
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 ${field.value === repo ? "opacity-100" : "opacity-0"}`}
                                  />
                                  {repo}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="ecrTag"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Step 3 — Tag</FormLabel>
                <FormControl>
                  <Popover
                    open={tagOpen}
                    onOpenChange={(o) => {
                      if (ecrRepo) setTagOpen(o);
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        aria-expanded={tagOpen}
                        disabled={!ecrRepo}
                        className="w-full justify-between font-normal"
                      >
                        {field.value ||
                          (ecrRepo
                            ? "Select a tag..."
                            : "Select a repository first")}
                        {ecrTagsLoading ? (
                          <Loader2 className="ml-2 h-4 w-4 animate-spin opacity-50" />
                        ) : (
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command>
                        <CommandInput
                          placeholder="Search tag..."
                          value={tagSearch}
                          onValueChange={setTagSearch}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {ecrTagsLoading ? (
                              <span className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading...
                              </span>
                            ) : (
                              "No tags found."
                            )}
                          </CommandEmpty>
                          {tagSearch.trim() && (
                            <CommandGroup>
                              <CommandItem
                                value={tagSearch.trim()}
                                onSelect={() => {
                                  field.onChange(tagSearch.trim());
                                  setTagSearch("");
                                  setTagOpen(false);
                                }}
                                className="justify-center"
                              >
                                Use &quot;{tagSearch.trim()}&quot;
                              </CommandItem>
                            </CommandGroup>
                          )}
                          {ecrTags && ecrTags.length > 0 && (
                            <CommandGroup>
                              {ecrTags.map((tag) => (
                                <CommandItem
                                  key={tag}
                                  value={tag}
                                  onSelect={(selected) => {
                                    field.onChange(selected);
                                    setTagSearch("");
                                    setTagOpen(false);
                                  }}
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 ${field.value === tag ? "opacity-100" : "opacity-0"}`}
                                  />
                                  {tag}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex flex-row justify-end">
          <Button
            type="submit"
            className="w-fit"
            isLoading={form.formState.isSubmitting}
          >
            Save
          </Button>
        </div>
      </form>
    </Form>
  );
};
