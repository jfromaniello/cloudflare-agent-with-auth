import { type Connection, type Schedule } from "agents";
import { unstable_getSchedulePrompt } from "agents/schedule";

import { AIChatAgent } from "agents/ai-chat-agent";
import {
  createDataStreamResponse,
  generateId,
  generateText,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
  type Message
} from "ai";
import { openai } from "@ai-sdk/openai";
import { processToolCalls } from "./utils";
import { tools, executions } from "./tools";
import { WithAuth } from "agents-oauth2-jwt-bearer";

const model = openai("gpt-4o-2024-11-20");

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends WithAuth(AIChatAgent<Env>) {
  private async isCurrentUserOwner(): Promise<boolean> {
    const userInfo = await this.getUserInfo();
    const agentStorage = this.ctx.storage;
    const objectOwner = await agentStorage.get('owner');
    if (objectOwner !== userInfo?.sub) {
      return false;
    }
    return true;
  }

  async onAuthenticatedConnect(connection: Connection): Promise<void> {
    if (!(await this.isCurrentUserOwner())) {
      connection.close(1008, 'This chat is not yours.');
    }
  }

  async onAuthenticatedRequest(request: Request): Promise<void | Response> {
    if (!(await this.isCurrentUserOwner())) {
      return new Response("This chat is not yours.", { status: 403 });
    }

    const url = new URL(request.url);
    if (url.pathname.endsWith("title")) {
      const title = await this.getTitle();
      return new Response(title);
    }
  }

  /**
   * Handles incoming chat messages and manages the response stream
   * @param onFinish - Callback function executed when streaming completes
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ) {
    // Collect all tools, including MCP tools
    const allTools = {
      ...tools,
      ...this.mcp.unstable_getAITools(),
    };
    const userInfo = (await this.getUserInfo())!;
    // Create a streaming response that handles both text and tool outputs
    const dataStreamResponse = createDataStreamResponse({
      execute: async (dataStream) => {
        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: this.messages,
          dataStream,
          tools: allTools,
          executions,
        });

        // Stream the AI response using GPT-4
        const result = streamText({
          model,
          system: `You are a helpful assistant that can do various tasks...

${unstable_getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.

The name of the user is ${userInfo.name ?? "unknown"}.
`,
          messages: processedMessages,
          tools: allTools,
          onFinish: async (args) => {
            await this.generateTitle(this.messages, args.text);

            onFinish(
              args as Parameters<StreamTextOnFinishCallback<ToolSet>>[0]
            );
            // await this.mcp.closeConnection(mcpConnection.id);
          },
          onError: (error) => {
            console.error("Error while streaming:", error);
          },
          maxSteps: 10,
        });

        // Merge the AI response stream with tool execution outputs
        result.mergeIntoDataStream(dataStream);
      },
    });

    return dataStreamResponse;
  }

  async executeTask(description: string, task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        content: `Running scheduled task: ${description}`,
        createdAt: new Date(),
      },
    ]);
  }

  async generateTitle(
    messages: Message[],
    newText: string
  ): Promise<void> {
    if (messages.length < 2) return;
    if (messages.length > 6) return;
    const { text: title } = await generateText({
      model,
      prompt: `Summarize the following conversation in a short and descriptive title,
      like a chat topic label.

      Do not include quotes or punctuation around the title

      Keep it under 8 words, clear and relevant:

      ${messages
        .map((message) => `- ${message.role}: ${message.content}`)
        .join("\n")
      }\n
      - assistant: ${newText}
      `,
    });
    await this.ctx.storage.put("title", title);
  }

  async getTitle(): Promise<string> {
    const title = await this.ctx.storage.get<string>("title");
    if (title) {
      return title;
    }
    return 'New Chat';
  }

  async setOwner(owner: string): Promise<void> {
    if (!owner) {
      throw new Error("Owner cannot be empty");
    }
    await this.ctx.storage.put("owner", owner);
  }
}
