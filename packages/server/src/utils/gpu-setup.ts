import { docker } from '../constants';

export async function setupGPUSupport() {
  await docker.swarmUpdate({
    TaskDefaults: {
      GenericResources: [{ DiscreteResourceSpec: { Kind: 'gpu', Value: 1 } }]
    }
  });
}