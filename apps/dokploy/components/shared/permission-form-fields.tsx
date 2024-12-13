import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import type { Control } from "react-hook-form";
import type { BasePermissions, TeamPermissions } from "./shared-permissions";
import { api } from "@/utils/api";
import { extractServices } from "@/pages/dashboard/project/[projectId]";

interface PermissionFieldProps {
  control: Control<BasePermissions> | Control<TeamPermissions>;
  showTeamFields?: boolean;
}

export const PermissionFormFields = ({ control, showTeamFields = false }: PermissionFieldProps) => {
  const { data: projects = [] } = api.project.all.useQuery();

  return (
    <div className="space-y-8">
      {/* Team-specific Permissions */}
      {showTeamFields && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium">Team Management</h3>
            <p className="text-sm text-muted-foreground">
              Configure team management permissions
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={control as Control<TeamPermissions>}
              name="canManageTeam"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Manage Team</FormLabel>
                    <FormDescription>
                      Allow member to manage team settings and members
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={control as Control<TeamPermissions>}
              name="canInviteMembers"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Invite Members</FormLabel>
                    <FormDescription>
                      Allow member to invite new members to the team
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={control as Control<TeamPermissions>}
              name="canRemoveMembers"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Remove Members</FormLabel>
                    <FormDescription>
                      Allow member to remove other members from the team
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={control as Control<TeamPermissions>}
              name="canEditTeamSettings"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Edit Team Settings</FormLabel>
                    <FormDescription>
                      Allow member to edit team name and description
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={control as Control<TeamPermissions>}
              name="canViewTeamResources"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>View Team Resources</FormLabel>
                    <FormDescription>
                      Allow member to view team resources and activity
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={control as Control<TeamPermissions>}
              name="canManageTeamResources"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Manage Team Resources</FormLabel>
                    <FormDescription>
                      Allow member to create and manage team resources
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </div>
      )}

      {/* Resource Management */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">Resource Management</h3>
          <p className="text-sm text-muted-foreground">
            Configure permissions for managing projects and services
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={control as Control<BasePermissions>}
            name="canCreateProjects"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel>Create Projects</FormLabel>
                  <FormDescription>
                    Allow user to create new projects
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={control as Control<BasePermissions>}
            name="canCreateServices"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel>Create Services</FormLabel>
                  <FormDescription>
                    Allow user to create new services
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={control as Control<BasePermissions>}
            name="canDeleteProjects"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel>Delete Projects</FormLabel>
                  <FormDescription>
                    Allow user to delete projects
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={control as Control<BasePermissions>}
            name="canDeleteServices"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel>Delete Services</FormLabel>
                  <FormDescription>
                    Allow user to delete services
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Additional Access Controls */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">Additional Access</h3>
          <p className="text-sm text-muted-foreground">
            Configure access to additional resources
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={control as Control<BasePermissions>}
            name="canAccessToTraefikFiles"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel>Access Traefik Files</FormLabel>
                  <FormDescription>
                    Allow user to access Traefik configuration files
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={control as Control<BasePermissions>}
            name="canAccessToDocker"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel>Access Docker</FormLabel>
                  <FormDescription>
                    Allow user to access Docker resources
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={control as Control<BasePermissions>}
            name="canAccessToAPI"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel>Access API</FormLabel>
                  <FormDescription>
                    Allow user to access API endpoints
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={control as Control<BasePermissions>}
            name="canAccessToSSHKeys"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel>Access SSH Keys</FormLabel>
                  <FormDescription>
                    Allow user to access SSH keys
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={control as Control<BasePermissions>}
            name="canAccessToGitProviders"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel>Access Git Providers</FormLabel>
                  <FormDescription>
                    Allow user to access Git provider settings
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Project and Service Access */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">Project Access</h3>
          <p className="text-sm text-muted-foreground">
            Configure access to specific projects and services
          </p>
        </div>

        <FormField
          control={control as Control<BasePermissions>}
          name="accesedProjects"
          render={() => (
            <FormItem className="md:col-span-2">
              <div className="mb-4">
                <FormLabel className="text-base">Projects</FormLabel>
                <FormDescription>
                  Select the Projects that the user can access
                </FormDescription>
              </div>
              {projects?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No projects found
                </p>
              )}
              <div className="grid md:grid-cols-2 gap-4">
                {projects?.map((item, index) => {
                  const applications = extractServices(item);
                  return (
                    <FormField
                      key={`project-${index}`}
                      control={control as Control<BasePermissions>}
                      name="accesedProjects"
                      render={({ field }) => {
                        return (
                          <FormItem
                            key={item.projectId}
                            className="flex flex-col items-start space-x-4 rounded-lg p-4 border"
                          >
                            <div className="flex flex-row gap-4">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(
                                    item.projectId,
                                  )}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([
                                          ...(field.value || []),
                                          item.projectId,
                                        ])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) =>
                                              value !== item.projectId,
                                          ),
                                        );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="text-sm font-medium text-primary">
                                {item.name}
                              </FormLabel>
                            </div>
                            {applications.length === 0 && (
                              <p className="text-sm text-muted-foreground">
                                No services found
                              </p>
                            )}
                            {applications?.map((item, index) => (
                              <FormField
                                key={`service-${index}`}
                                control={control as Control<BasePermissions>}
                                name="accesedServices"
                                render={({ field }) => {
                                  return (
                                    <FormItem
                                      key={item.id}
                                      className="flex flex-row items-start space-x-3 space-y-0"
                                    >
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(
                                            item.id,
                                          )}
                                          onCheckedChange={(checked) => {
                                            return checked
                                              ? field.onChange([
                                                  ...(field.value || []),
                                                  item.id,
                                                ])
                                              : field.onChange(
                                                  field.value?.filter(
                                                    (value) =>
                                                      value !== item.id,
                                                  ),
                                                );
                                          }}
                                        />
                                      </FormControl>
                                      <FormLabel className="text-sm text-muted-foreground">
                                        {item.name}
                                      </FormLabel>
                                    </FormItem>
                                  );
                                }}
                              />
                            ))}
                          </FormItem>
                        );
                      }}
                    />
                  );
                })}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
};
