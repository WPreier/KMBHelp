export const defaultPublicLinks = {
  www: 'https://kmb-steuerberatung.at',
  home: 'https://home.kmbcloud.at',
  wiki: 'https://wiki.kmbcloud.at',
} as const;

export type PublicLinkTargets = {
  www: string;
  home: string;
  wiki: string;
};

function chosen(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? fallback : trimmed;
}

export function publicLinkTargets(input: {
  www?: string | undefined;
  home?: string | undefined;
  wiki?: string | undefined;
}): PublicLinkTargets {
  return {
    www: chosen(input.www, defaultPublicLinks.www),
    home: chosen(input.home, defaultPublicLinks.home),
    wiki: chosen(input.wiki, defaultPublicLinks.wiki),
  };
}
