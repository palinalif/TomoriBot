export interface OpenrouterProviderRouting {
  require_parameters: boolean;
}

export function buildOpenrouterProviderRouting(options: { hasTools: boolean }): OpenrouterProviderRouting | undefined {
  if (!options.hasTools) {
    return undefined;
  }

  return {
    require_parameters: true,
  };
}
