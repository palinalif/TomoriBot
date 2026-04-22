import { GoogleStreamAdapter } from "@/providers/google/googleStreamAdapter";
import { VertexStreamAdapter } from "@/providers/vertex/vertexStreamAdapter";
import type { ProviderError } from "@/types/stream/interfaces";
import { createVertexexpressClient } from "@/providers/vertexexpress/vertexexpressClient";

export class VertexexpressStreamAdapter extends VertexStreamAdapter {
  private readonly googleAdapter = new GoogleStreamAdapter();

  constructor() {
    super({
      providerName: "vertexexpress",
      clientFactory: createVertexexpressClient,
    });
  }

  override handleProviderError(error: unknown): ProviderError {
    const providerError = this.googleAdapter.handleProviderError(error);
    return {
      ...providerError,
      message: providerError.message.replace(/^Google API error/, "Vertex AI Express error"),
    };
  }
}
