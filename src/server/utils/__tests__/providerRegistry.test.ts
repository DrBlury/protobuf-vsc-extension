/**
 * Tests for provider registry
 */

import { ProviderRegistry } from '../providerRegistry';

describe('ProviderRegistry', () => {
  it('should initialize all providers', () => {
    const registry = new ProviderRegistry();

    expect(registry.parser).toBeDefined();
    expect(registry.analyzer).toBeDefined();
    expect(registry.diagnostics).toBeDefined();
    expect(registry.formatter).toBeDefined();
    expect(registry.completion).toBeDefined();
    expect(registry.hover).toBeDefined();
    expect(registry.definition).toBeDefined();
    expect(registry.references).toBeDefined();
    expect(registry.symbols).toBeDefined();
    expect(registry.renumber).toBeDefined();
    expect(registry.rename).toBeDefined();
    expect(registry.codeActions).toBeDefined();
    expect(registry.schemaGraph).toBeDefined();
    expect(registry.codeLens).toBeDefined();
    expect(registry.documentLinks).toBeDefined();
    expect(registry.migration).toBeDefined();
    expect(registry.protoc).toBeDefined();
    expect(registry.breaking).toBeDefined();
    expect(registry.externalLinter).toBeDefined();
    expect(registry.clangFormat).toBeDefined();
    expect(registry.bufFormat).toBeDefined();
  });

  it('should set workspace roots', () => {
    const registry = new ProviderRegistry();

    const setWorkspaceRootSpy = jest.spyOn(registry.protoc, 'setWorkspaceRoot');
    const setBreakingRootSpy = jest.spyOn(registry.breaking, 'setWorkspaceRoot');
    const setLinterRootSpy = jest.spyOn(registry.externalLinter, 'setWorkspaceRoot');
    const setAnalyzerRootsSpy = jest.spyOn(registry.analyzer, 'setWorkspaceRoots');

    registry.setWorkspaceRoots(['/workspace']);

    expect(setWorkspaceRootSpy).toHaveBeenCalledWith('/workspace');
    expect(setBreakingRootSpy).toHaveBeenCalledWith('/workspace');
    expect(setLinterRootSpy).toHaveBeenCalledWith('/workspace');
    expect(setAnalyzerRootsSpy).toHaveBeenCalledWith(['/workspace']);
  });

  it('should handle empty workspace roots', () => {
    const registry = new ProviderRegistry();

    const setWorkspaceRootSpy = jest.spyOn(registry.protoc, 'setWorkspaceRoot');
    const setAnalyzerRootsSpy = jest.spyOn(registry.analyzer, 'setWorkspaceRoots');

    registry.setWorkspaceRoots([]);

    expect(setWorkspaceRootSpy).not.toHaveBeenCalled();
    expect(setAnalyzerRootsSpy).not.toHaveBeenCalled();
  });

  it('should use first workspace root', () => {
    const registry = new ProviderRegistry();

    const setWorkspaceRootSpy = jest.spyOn(registry.protoc, 'setWorkspaceRoot');

    registry.setWorkspaceRoots(['/workspace1', '/workspace2']);

    expect(setWorkspaceRootSpy).toHaveBeenCalledWith('/workspace1');
  });
});
