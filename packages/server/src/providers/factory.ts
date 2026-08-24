import {
	CloudProvider,
	type ICloudProvider,
	type IProviderFactory,
	type ProviderCredentials,
} from "./types";
import { supportedCloudProviderIds } from "./registry-client";
import { HetznerProvider } from "./hetzner/provider";
import { AwsProvider } from "./aws/provider";
import { DigitalOceanProvider } from "./digitalocean/provider";

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
				return new HetznerProvider(credentials);
			case CloudProvider.AWS:
				return new AwsProvider(credentials);
			case CloudProvider.DIGITALOCEAN:
				return new DigitalOceanProvider(credentials);
			default:
				throw new Error(`Unsupported provider: ${provider}`);
		}
	}

	getSupportedProviders(): CloudProvider[] {
		return [...supportedCloudProviderIds];
	}
}

// Export singleton instance
export const providerFactory = new ProviderFactory();

// Helper function for creating providers
export function createCloudProvider(
	provider: CloudProvider,
	credentials: ProviderCredentials,
): ICloudProvider {
	return providerFactory.createProvider(provider, credentials);
}
