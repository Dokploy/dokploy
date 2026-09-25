# 1Password Environments provider

Dokploy can read variables from a [1Password Environment](https://www.1password.dev/environments/) through the official JavaScript SDK. One Dokploy provider is bound to one 1Password Environment.

## Configure

1. Create a 1Password Environment for the project and stage, and add variables such as `API_KEY` to it. Programmatic Environment access is currently a beta feature of 1Password.
2. Ask a 1Password administrator to create a service account with **Read** access to that Environment. Access to an ordinary vault does not grant access to the Environment.
3. In the 1Password desktop app, open **Developer → View Environments → View environment → Manage environment → Copy environment ID**.
4. In Dokploy, add a **1Password** secrets provider. Enter the Environment ID and service account token, then assign the provider to the appropriate Dokploy project and environment. Use a separate provider for each 1Password Environment.
5. Select **Test connection**. This verifies that the service account can read the Environment. **Import from vault** lists the Environment's variable names. For a provider named `onepassword`, an imported or manually entered variable looks like:

   ```dotenv
   API_KEY=${{vault.onepassword.API_KEY}}
   ```

6. Redeploy after changing a value in 1Password. Dokploy resolves references at deployment time; it does not continuously refresh running containers.

## Credential handling

The service account token is masked in Dokploy settings responses, but its provider configuration is stored in Dokploy's database. Protect database backups and give the token access only to the required Environment. Deployed application environment variables contain resolved values, so users with access to container configuration may be able to read them.
