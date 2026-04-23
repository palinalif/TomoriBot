import { GoogleStreamAdapter } from "@/providers/google/googleStreamAdapter";
import { VertexStreamAdapter } from "@/providers/vertex/vertexStreamAdapter";
import type { ProviderError } from "@/types/stream/interfaces";
import { createVertexexpressClient } from "@/providers/vertexexpress/vertexexpressClient";
import { localizer } from "@/utils/text/localizer";

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

  override createErrorDescription(error: ProviderError, locale: string): string | null {
    const isExpressPermissionError =
      error.code === "403" &&
      /aiplatform\.endpoints\.predict/i.test(error.message) &&
      /publishers\/google\/models\//i.test(error.message);

    if (isExpressPermissionError) {
      return `Error Code 403: ${localizer(locale, "genai.vertexexpress.403_predict_permission_message")}`;
    }

    return super.createErrorDescription(error, locale);
  }
}
