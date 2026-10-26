export type SearchHitKind = 'faq' | 'article' | 'ticket';

export type SearchExplanationInput = {
  kind: SearchHitKind;
  title: string;
};

export type SearchSentence = { de: string; en: string };

export interface SearchExplainer {
  explain(input: SearchExplanationInput): SearchSentence;
}

export const categoryTitleExplainer: SearchExplainer = {
  explain() {
    return {
      de: 'Treffer wegen Kategorie/Titel',
      en: 'Match because of category or title',
    };
  },
};
