# ![Z.AI logo](https://models.dev/logos/zai.svg)Z.AI

Access 10 Z.AI models through Mastra's model router. Authentication is handled automatically using the `ZHIPU_API_KEY` environment variable.

Learn more in the [Z.AI documentation](https://docs.z.ai/guides/overview/pricing).

```bash
ZHIPU_API_KEY=your-api-key
```

```typescript
import { Agent } from "@mastra/core/agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  instructions: "You are a helpful assistant",
  model: "zai/glm-4.5"
});

// Generate a response
const response = await agent.generate("Hello!");

// Stream a response
const stream = await agent.stream("Tell me a story");
for await (const chunk of stream) {
  console.log(chunk);
}
```

> **Info:** Mastra uses the OpenAI-compatible `/chat/completions` endpoint. Some provider-specific features may not be available. Check the [Z.AI documentation](https://docs.z.ai/guides/overview/pricing) for details.

## Models

| Model               | Context | Tools | Reasoning | Image | Audio | Video | Input $/1M | Output $/1M |
| ------------------- | ------- | ----- | --------- | ----- | ----- | ----- | ---------- | ----------- |
| `zai/glm-4.5`       | 131K    |       |           |       |       |       | $0.60      | $2          |
| `zai/glm-4.5-air`   | 131K    |       |           |       |       |       | $0.20      | $1          |
| `zai/glm-4.5-flash` | 131K    |       |           |       |       |       | —          | —           |
| `zai/glm-4.5v`      | 64K     |       |           |       |       |       | $0.60      | $2          |
| `zai/glm-4.6`       | 205K    |       |           |       |       |       | $0.60      | $2          |
| `zai/glm-4.6v`      | 128K    |       |           |       |       |       | $0.30      | $0.90       |
| `zai/glm-4.7`       | 205K    |       |           |       |       |       | $0.60      | $2          |
| `zai/glm-4.7-flash` | 200K    |       |           |       |       |       | —          | —           |
| `zai/glm-5`         | 205K    |       |           |       |       |       | $1         | $3          |
| `zai/glm-5-turbo`   | 200K    |       |           |       |       |       | $1         | $4          |

## Advanced configuration

### Custom headers

```typescript
const agent = new Agent({
  id: "custom-agent",
  name: "custom-agent",
  model: {
    url: "https://api.z.ai/api/paas/v4",
    id: "zai/glm-4.5",
    apiKey: process.env.ZHIPU_API_KEY,
    headers: {
      "X-Custom-Header": "value"
    }
  }
});
```

### Dynamic model selection

```typescript
const agent = new Agent({
  id: "dynamic-agent",
  name: "Dynamic Agent",
  model: ({ requestContext }) => {
    const useAdvanced = requestContext.task === "complex";
    return useAdvanced
      ? "zai/glm-5-turbo"
      : "zai/glm-4.5";
  }
});
```