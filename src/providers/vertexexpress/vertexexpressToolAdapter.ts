import type { MCPCapableToolAdapter, Tool, ToolContext, ToolResult } from "@/types/tool/interfaces";
import type { TypedMCPToolResult } from "@/types/tool/mcpTypes";
import { GoogleToolAdapter } from "@/providers/google/googleToolAdapter";

export class VertexexpressToolAdapter implements MCPCapableToolAdapter {
  private static instance: VertexexpressToolAdapter;
  private readonly googleAdapter: GoogleToolAdapter;

  private constructor() {
    this.googleAdapter = GoogleToolAdapter.getInstance();
  }

  static getInstance(): VertexexpressToolAdapter {
    if (!VertexexpressToolAdapter.instance) {
      VertexexpressToolAdapter.instance = new VertexexpressToolAdapter();
    }
    return VertexexpressToolAdapter.instance;
  }

  getProviderName(): string {
    return "vertexexpress";
  }

  convertTool(tool: Tool): Record<string, unknown> {
    return this.googleAdapter.convertTool(tool);
  }

  convertResult(result: ToolResult): Record<string, unknown> {
    return this.googleAdapter.convertResult(result);
  }

  async getAllToolsInProviderFormat(
    builtInTools: Tool[],
    serverId?: number,
    allowedMCPFunctions?: string[],
  ): Promise<Array<Record<string, unknown>>> {
    return this.googleAdapter.getAllToolsInGoogleFormat(builtInTools, serverId, allowedMCPFunctions);
  }

  async isMCPFunction(functionName: string): Promise<boolean> {
    return this.googleAdapter.isMCPFunction(functionName);
  }

  async executeMCPFunction(
    functionName: string,
    args: Record<string, unknown>,
    context?: ToolContext,
  ): Promise<TypedMCPToolResult> {
    return this.googleAdapter.executeMCPFunction(functionName, args, context);
  }
}

export function getVertexexpressToolAdapter(): VertexexpressToolAdapter {
  return VertexexpressToolAdapter.getInstance();
}
