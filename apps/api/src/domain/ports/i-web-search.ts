export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

export interface IWebSearch {
  search(query: string): Promise<WebSearchResult[]>;
}
