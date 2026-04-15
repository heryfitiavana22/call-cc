export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

export interface WebSearchPort {
  search(query: string): Promise<WebSearchResult[]>;
}
