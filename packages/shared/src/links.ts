export type PublicLinkTargets = {
  www: string;
  home: string;
  wiki: string;
};

export function publicLinkTargets(input: {
  www?: string | undefined;
  home?: string | undefined;
  wiki?: string | undefined;
}): PublicLinkTargets {
  return {
    www: input.www?.trim() ?? '',
    home: input.home?.trim() ?? '',
    wiki: input.wiki?.trim() ?? '',
  };
}
