> ## Documentation Index
> Fetch the complete documentation index at: https://docs.z.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Streaming Messages

<Tip>
  Streaming Messages allow real-time content retrieval while the model generates responses, without waiting for the complete response to be generated. This approach can significantly improve user experience, especially when generating long text content, as users can immediately see output beginning to appear.
</Tip>

## Features

Streaming messages use an incremental generation mechanism, transmitting content in chunks in real-time during the generation process, rather than waiting for the complete response to be generated before returning it all at once. This mechanism allows developers to:

* **Real-time Response**: No need to wait for complete response, content displays progressively
* **Improved Experience**: Reduce user waiting time, provide instant feedback
* **Reduced Latency**: Content is transmitted as it's generated, reducing perceived latency
* **Flexible Processing**: Real-time processing and display during reception

### Core Parameter Description

* **`stream=True`**: Enable streaming output, must be set to `True`
* **`model`**: Models that support streaming output, such as `glm-5`,  `glm-4.7`, `glm-4.6`, `glm-4.5`, etc.

### Response Format Description

Streaming responses use Server-Sent Events (SSE) format, with each event containing:

* `choices[0].delta.content`: Incremental text content
* `choices[0].delta.reasoning_content`: Incremental reasoning content
* `choices[0].finish_reason`: Completion reason (only appears in the last chunk)
* `usage`: Token usage statistics (only appears in the last chunk)

## Code Examples

<Tabs>
  <Tab title="cURL">
    ```bash  theme={null}
    curl --location 'https://api.z.ai/api/paas/v4/chat/completions' \
    --header 'Authorization: Bearer YOUR_API_KEY' \
    --header 'Content-Type: application/json' \
    --data '{
        "model": "glm-5",
        "messages": [
            {
                "role": "user",
                "content": "Write a poem about spring"
            }
        ],
        "stream": true
    }'
    ```
  </Tab>

  <Tab title="Python">
    **Install SDK**

    ```bash  theme={null}
    # Install latest version
    pip install zai-sdk

    # Or specify version
    pip install zai-sdk==0.1.0
    ```

    **Verify Installation**

    ```python  theme={null}
    import zai
    print(zai.__version__)
    ```

    **Complete Example**

    ```python  theme={null}
    from zai import ZaiClient

    # Initialize client
    client = ZaiClient(api_key='Your API Key')

    # Create streaming message request
    response = client.chat.completions.create(
        model="glm-5",
        messages=[
            {"role": "user", "content": "Write a poem about spring"}
        ],
        stream=True  # Enable streaming output
    )

    # Process streaming response
    full_content = ""
    for chunk in response:
        if not chunk.choices:
            continue
        
        delta = chunk.choices[0].delta
        
        # Handle incremental content
        if hasattr(delta, 'content') and delta.content:
            full_content += delta.content
            print(delta.content, end="", flush=True)
        
        # Check if completed
        if chunk.choices[0].finish_reason:
            print(f"\n\nCompletion reason: {chunk.choices[0].finish_reason}")
            if hasattr(chunk, 'usage') and chunk.usage:
                print(f"Token usage: Input {chunk.usage.prompt_tokens}, Output {chunk.usage.completion_tokens}")

    print(f"\n\nComplete content:\n{full_content}")
    ```
  </Tab>
</Tabs>

### Response Example

The streaming response format is as follows:

```
data: {"id":"1","created":1677652288,"model":"glm-5","choices":[{"index":0,"delta":{"content":"Spring"},"finish_reason":null}]}

data: {"id":"1","created":1677652288,"model":"glm-5","choices":[{"index":0,"delta":{"content":" comes"},"finish_reason":null}]}

data: {"id":"1","created":1677652288,"model":"glm-5","choices":[{"index":0,"delta":{"content":" with"},"finish_reason":null}]}

...

data: {"id":"1","created":1677652288,"model":"glm-5","choices":[{"index":0,"finish_reason":"stop","delta":{"role":"assistant","content":""}}],"usage":{"prompt_tokens":8,"completion_tokens":262,"total_tokens":270,"prompt_tokens_details":{"cached_tokens":0}}}

data: [DONE]
```

## Application Scenarios

<CardGroup cols={2}>
  <Card title="Chat Applications" icon="headset">
    * Real-time conversation experience
    * Character-by-character reply display
    * Reduced waiting time
  </Card>

  <Card title="Content Generation" icon="feather">
    * Article writing assistant
    * Code generation tools
    * Creative content creation
  </Card>

  <Card title="Educational Applications" icon="book">
    * Online Q\&A systems
    * Learning assistance tools
    * Knowledge Q\&A platforms
  </Card>

  <Card title="Customer Service Systems" icon="users">
    * Intelligent customer service bots
    * Real-time problem solving
    * User support systems
  </Card>
</CardGroup>

> ## Documentation Index
> Fetch the complete documentation index at: https://docs.z.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Tool Streaming Output

<Tip>
  Stream Tool Call is a unique feature of Z.ai's latest model, allowing real-time access to reasoning processes, response content, and tool call information during tool invocation, providing better user experience and real-time feedback.
</Tip>

## Features

Tool calling in the latest GLM-5 GLM-4.7 GLM-4.6 model now supports streaming output for responses. This allows developers to stream tool usage parameters without buffering or JSON validation when calling `chat.completions`, reducing call latency and providing better user experience.

### Core Parameter Description

* **`stream=True`**: Enable streaming output, must be set to `True`
* **`tool_stream=True`**: Enable tool call streaming output
* **`model`**: Use a model that supports tool calling, limited to `glm-5`

### Response Parameter Description

The `delta` object in streaming responses contains the following fields:

* **`reasoning_content`**: Text content of the model's reasoning process
* **`content`**: Text content of the model's response
* **`tool_calls`**: Tool call information, including function names and parameters

## Code Examples

By setting the `tool_stream=True` parameter, you can enable streaming tool call functionality:

<Tabs>
  <Tab title="Python SDK">
    **Install SDK**

    ```bash  theme={null}
    # Install latest version
    pip install zai-sdk

    # Or specify version
    pip install zai-sdk==0.1.0
    ```

    **Verify Installation**

    ```python  theme={null}
    import zai
    print(zai.__version__)
    ```

    **Complete Example**

    ```python  theme={null}
    from zai import ZaiClient

    # Initialize client
    client = ZaiClient(api_key='Your API Key')

    # Create streaming tool call request
    response = client.chat.completions.create(
        model="glm-5",  # Use model that supports tool calling
        messages=[
            {"role": "user", "content": "How's the weather in Beijing?"},
        ],
        tools=[
            {
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "description": "Get current weather conditions for a specified location",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "location": {"type": "string", "description": "City, e.g.: Beijing, Shanghai"},
                            "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
                        },
                        "required": ["location"]
                    }
                }
            }
        ],
        stream=True,        # Enable streaming output
        tool_stream=True    # Enable tool call streaming output
    )

    # Initialize variables to collect streaming data
    reasoning_content = ""      # Reasoning process content
    content = ""               # Response content
    final_tool_calls = {}      # Tool call information
    reasoning_started = False  # Reasoning process start flag
    content_started = False    # Content output start flag

    # Process streaming response
    for chunk in response:
        if not chunk.choices:
            continue

        delta = chunk.choices[0].delta

        # Handle streaming reasoning process output
        if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
            if not reasoning_started and delta.reasoning_content.strip():
                print("\n🧠 Thinking Process:")
                reasoning_started = True
            reasoning_content += delta.reasoning_content
            print(delta.reasoning_content, end="", flush=True)

        # Handle streaming response content output
        if hasattr(delta, 'content') and delta.content:
            if not content_started and delta.content.strip():
                print("\n\n💬 Response Content:")
                content_started = True
            content += delta.content
            print(delta.content, end="", flush=True)

        # Handle streaming tool call information
        if delta.tool_calls:
            for tool_call in delta.tool_calls:
                index = tool_call.index
                if index not in final_tool_calls:
                    # New tool call
                    final_tool_calls[index] = tool_call
                    final_tool_calls[index].function.arguments = tool_call.function.arguments
                else:
                    # Append tool call parameters (streaming construction)
                    final_tool_calls[index].function.arguments += tool_call.function.arguments

    # Output final tool call information
    if final_tool_calls:
        print("\n📋 Function Calls Triggered:")
        for index, tool_call in final_tool_calls.items():
            print(f"  {index}: Function Name: {tool_call.function.name}, Parameters: {tool_call.function.arguments}")
    ```
  </Tab>
</Tabs>

## Application Scenarios

<CardGroup cols={2}>
  <Card title="Intelligent Customer Service" icon="headset">
    * Real-time query progress display
    * Improved waiting experience
  </Card>

  <Card title="Code Assistant" icon="code">
    * Real-time code analysis process
    * Display tool call chains
  </Card>
</CardGroup>


Built with [Mintlify](https://mintlify.com).