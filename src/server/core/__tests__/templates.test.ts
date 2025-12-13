/**
 * Tests for Template Provider
 */

import { TemplateProvider } from '../templates';

describe('TemplateProvider', () => {
  let templateProvider: TemplateProvider;

  beforeEach(() => {
    templateProvider = new TemplateProvider();
  });

  it('should return all available templates', () => {
    const templates = templateProvider.getTemplates();

    expect(templates.length).toBeGreaterThan(0);
    expect(templates.some(t => t.name === 'Basic Message')).toBe(true);
    expect(templates.some(t => t.name === 'Service with RPCs')).toBe(true);
    expect(templates.some(t => t.name === 'Enum')).toBe(true);
  });

  it('should return template by name', () => {
    const template = templateProvider.getTemplate('Basic Message');

    expect(template).toBeDefined();
    expect(template?.name).toBe('Basic Message');
    expect(template?.content).toContain('syntax = "proto3"');
    expect(template?.content).toContain('message');
  });

  it('should return undefined for non-existent template', () => {
    const template = templateProvider.getTemplate('NonExistent Template');

    expect(template).toBeUndefined();
  });

  it('should have valid proto syntax in all templates', () => {
    const templates = templateProvider.getTemplates();

    for (const template of templates) {
      expect(template.content).toContain('syntax = "proto3"');
      expect(template.content).toContain('package');
      expect(template.description).toBeTruthy();
    }
  });

  it('should have Basic Message template with fields', () => {
    const template = templateProvider.getTemplate('Basic Message');

    expect(template).toBeDefined();
    expect(template?.content).toContain('message');
    expect(template?.content).toMatch(/string\s+\w+\s*=\s*\d+/);
  });

  it('should have Service template with RPCs', () => {
    const template = templateProvider.getTemplate('Service with RPCs');

    expect(template).toBeDefined();
    expect(template?.content).toContain('service');
    expect(template?.content).toContain('rpc');
  });

  it('should have Enum template with values', () => {
    const template = templateProvider.getTemplate('Enum');

    expect(template).toBeDefined();
    expect(template?.content).toContain('enum');
    expect(template?.content).toMatch(/\w+\s*=\s*\d+/);
  });
});
