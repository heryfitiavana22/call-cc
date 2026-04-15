import { tavily } from "@tavily/core";
import type { IWebSearch, WebSearchResult } from "@/domain/ports/i-web-search";

export class TavilyWebSearchAdapter implements IWebSearch {
  private readonly client: ReturnType<typeof tavily>;

  constructor(apiKey: string) {
    this.client = tavily({ apiKey });
  }

  async search(query: string): Promise<WebSearchResult[]> {
    const response = await this.client.search(query, { maxResults: 3 });
    return response.results.map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
    }));
  }
}
