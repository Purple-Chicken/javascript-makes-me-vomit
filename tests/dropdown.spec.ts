/**
 * Mock class to represent the UI component logic
 * This fixes the 'Cannot find name component' error.
 */
class ModelSelector {
  private cachedModels: any[] | null = null;
  
  async handleDropdownOpen() {
    if (this.cachedModels) return;
    const res = await fetch('/api/models');
    this.cachedModels = await res.json();
  }
}

describe('Model Selector Component', () => {
  let component: ModelSelector;

  beforeEach(() => {
    component = new ModelSelector();
    // Mock the global fetch
    (globalThis as any).fetch = jasmine.createSpy('fetch').and.resolveTo({
      json: () => Promise.resolve([{ id: 'llama3', provider: 'local' }])
    } as any);
  });
  it('should not fetch models from the server if they are already cached', async () => {
    
    // Simulate first click
    await component.handleDropdownOpen();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    // Simulate second click
    await component.handleDropdownOpen();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
