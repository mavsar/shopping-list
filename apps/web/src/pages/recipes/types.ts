export interface ParsedRecipe {
  title: string;
  description?: string;
  imageUrl?: string;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  servings?: string;
  ingredients: string[];
  instructions: string[];
  images?: string[];
  url: string;
  source: string;
}

export interface SavedRecipe extends ParsedRecipe {
  id: number;
  createdAt: string;
  labelIds: number[];
}

/** Imported recipes (from a file or photo) have no web page to link to or re-fetch from. */
export function hasSourcePage(recipe: Pick<ParsedRecipe, 'url'>): boolean {
  return /^https?:\/\//i.test(recipe.url);
}
