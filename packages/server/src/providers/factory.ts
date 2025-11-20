import {
	CloudProvider,
	type ICloudProvider,
	type IProviderFactory,
	type ProviderCredentials,
} from "./types";
import { HetznerProvider } from "./hetzner/provider";

/**
 * Factory for creating cloud provider instances
 */
export class ProviderFactory implements IProviderFactory {
	createProvider(
		provider: CloudProvider,
		credentials: ProviderCredentials,
	): ICloudProvider {
		switch (provider) {
			case CloudProvider.HETZNER:
				return new HetznerProvider(credentials.apiToken);
			// Future providers can be added here:
			// case CloudProvider.DIGITALOCEAN:
			//   return new DigitalOceanProvider(credentials.apiToken);
			// case CloudProvider.VULTR:
			//   return new VultrProvider(credentials.apiToken);
			default:
				throw new Error(`Unsupported provider: ${provider}`);
		}
	}

	getSupportedProviders(): CloudProvider[] {
		return [
			CloudProvider.HETZNER,
			// Add more providers as they are implemented
		];
	}
}

// Export singleton instance
export const providerFactory = new ProviderFactory();

// Helper function for creating providers
export function createCloudProvider(
	provider: CloudProvider,
	apiToken: string,
): ICloudProvider {
	return providerFactory.createProvider(provider, { provider, apiToken });
}
