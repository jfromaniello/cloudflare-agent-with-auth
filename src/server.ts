import { type Schedule } from "agents";
import { agentsMiddleware } from "hono-agents";
import { auth, requiresAuth, type OIDCVariables, type UserInfo } from "hono-openid-connect";
import { Hono } from "hono";
import { logger } from 'hono/logger'
import { unstable_getSchedulePrompt } from "agents/schedule";

import { AIChatAgent } from "agents/ai-chat-agent";
import {
  createDataStreamResponse,
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { processToolCalls } from "./utils";
import { tools, executions } from "./tools";
import { WithAuth } from "agents-oauth2-jwt-bearer";

const model = openai("gpt-4o-2024-11-20");
// Cloudflare AI Gateway
// const openai = createOpenAI({
//   apiKey: env.OPENAI_API_KEY,
//   baseURL: env.GATEWAY_BASE_URL,
// });

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends WithAuth(AIChatAgent<Env>) {
  /**
   * Handles incoming chat messages and manages the response stream
   * @param onFinish - Callback function executed when streaming completes
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ) {
    const userInfo = await this.getUserInfo();
    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    // Collect all tools, including MCP tools
    const allTools = {
      ...tools,
      ...this.mcp.unstable_getAITools(),
    };

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

The name of the user is ${userInfo?.name ?? "unknown"}.
`,
          messages: processedMessages,
          tools: allTools,
          onFinish: async (args) => {
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
}

const app = new Hono<{ Bindings: Env; Variables: OIDCVariables<{
  user: UserInfo;
}>}>();

app.use(logger());

app.use(
  auth({
    authRequired: false,
    idpLogout: true,
    session: {
      encryptionKey: process.env.OIDC_SESSION_ENCRYPTION_KEY,
    },
  })
);

// app.get("/", async (c) => {
//   return c.redirect(`/c/${generateId()}`);
// });

app.get("/user", async (c): Promise<Response> => {
  const session = c.get('session');
  let userInfo = session?.get('user');
  if (!userInfo) {
    userInfo = await c.var.oidc?.fetchUserInfo();
    if (!userInfo) {
      return c.json({ error: "User not authenticated" }, 401);
    }
    session?.set('user', userInfo);
  }
  return c.json(userInfo);
});

app.get("/other", async (c): Promise<Response> => {
  const session = c.get('session');
  const count =  session?.get('user') ?? 0;
  return c.text('user: ' + count);
});

// app.get("/check-open-ai-key", async (c) => {
//   return c.json({
//     success: process.env.OPENAI_API_KEY !== undefined,
//   });
// });

// app.get("/c/:chadID", requiresAuth(), async (c) => {
//   const res = await c.env.ASSETS.fetch(new URL("/", c.req.url));
//   return new Response(res.body, res);
// });

// app.use("*", async (c, next) => {
//   const url = new URL(c.req.url);
//   if (url.pathname.startsWith("/agents")) {
//     return next();
//   }
//   const res = await c.env.ASSETS.fetch(c.req.raw);
//   return new Response(res.body, res);
// });

// app.use("*", async (c, next) => {
//   const tokenSet = c.var.oidc?.tokens;
//   return agentsMiddleware({
//     options: {
//       prefix: `agents`,
//       async onBeforeConnect(req, lobby) {
//         if (!c.var.oidc?.isAuthenticated || c.var.oidc?.isExpired) {
//           return new Response(
//             JSON.stringify({
//               error: "Unauthorized",
//               message: "You must be logged in to use this endpoint.",
//             }),
//             { status: 401 }
//           );
//         }
//         const r = new Request(req);
//         const accessToken = tokenSet?.access_token as string;
//         r.headers.set("Authorization", `Bearer ${accessToken}`);
//         return r;
//       },
//     },
//     // @ts-ignore
//   })(c, next);
// });

export default app;
