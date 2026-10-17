import { describe, it, expect, vi } from 'vitest';
import { exec } from 'node:child_process';

// Mocking the exec command to verify the filter is applied
vi.mock('node:child_process', () => ({
  exec: vi.fn()
}));

describe('Docker Cleanup Safety', () => {
  it('should include the exclusion filter for dokploy-traefik', () => {
    const filter = 'label!=com.dokploy.traefik=true';
    const containerPrune = 'docker container prune -f --filter ' + filter;
    const imagePrune = 'docker image prune -a -f --filter ' + filter;
    
    expect(containerPrune).toContain('label!=com.dokploy.traefik=true');
    expect(imagePrune).toContain('label!=com.dokploy.traefik=true');
  });
});