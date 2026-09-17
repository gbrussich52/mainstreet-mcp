import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { BusinessConfigSchema, formatZodError, type BusinessConfig } from './schema.js';
import { getPreset } from '../presets/index.js';

export class ConfigError extends Error {}

export function loadConfigFromString(yamlText: string, sourceLabel = '<config>'): BusinessConfig {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (err) {
    throw new ConfigError(`${sourceLabel}: invalid YAML — ${(err as Error).message}`);
  }

  const parsed = BusinessConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ConfigError(`${sourceLabel}: config validation failed:\n${formatZodError(parsed.error)}`);
  }
  const config = parsed.data;

  const preset = getPreset(config.business.industry);
  const knownCapabilities = new Set(preset.capabilities.map((c) => c.name));
  for (const capName of Object.keys(config.capabilities)) {
    if (!knownCapabilities.has(capName)) {
      throw new ConfigError(
        `${sourceLabel}: capabilities.${capName} is not available for industry "${config.business.industry}" ` +
          `(available: ${[...knownCapabilities].join(', ') || 'none'})`,
      );
    }
  }
  for (const cap of preset.capabilities) {
    if (config.capabilities[cap.name] !== undefined) {
      const result = cap.configSchema.safeParse(config.capabilities[cap.name]);
      if (!result.success) {
        throw new ConfigError(`${sourceLabel}: capabilities.${cap.name} is invalid:\n${formatZodError(result.error)}`);
      }
      config.capabilities[cap.name] = result.data;
    }
  }
  return config;
}

export function loadConfigFromFile(path: string): BusinessConfig {
  const text = readFileSync(path, 'utf-8');
  return loadConfigFromString(text, path);
}
