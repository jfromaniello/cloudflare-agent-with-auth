import { agentsMiddleware } from "hono-agents";
import { auth, requiresAuth, type OIDCVariables, type UserInfo } from "hono-openid-connect";
import { Hono } from "hono";
import { logger } from 'hono/logger';
import { generateId } from "ai";
export { Chat } from './agent';

const app = new Hono<{ Bindings: Env; Variables: OIDCVariables<{
  user: UserInfo | null
}>}>();

app.use(logger());

app.use(
  auth({
    authRequired: false,
    idpLogout: true,
  })
);

app.get("/user", async (c): Promise<Response> => {
  const session = c.get('session');
  if (!c.get('oidc')?.isAuthenticated) {
    session?.set('user', null)
    return c.json({ error: "User not authenticated" }, 401);
  }
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

app.get("/check-open-ai-key", async (c) => {
  return c.json({
    success: process.env.OPENAI_API_KEY !== undefined,
  });
});

type ChatListItem = {
  id: string;
  createdAt: number;
}

app.post("/c", requiresAuth(),  async (c) => {
  const id = generateId();
  const chatID = c.env.Chat.idFromName(id);
  const stub = c.env.Chat.get(chatID);
  const userID = c.var.oidc?.claims?.sub as string;
  await stub.setOwner(userID);
  //insert the chat into the list
  await c.env.ChatList.put(userID, JSON.stringify([
    ...(await c.env.ChatList.get<ChatListItem[]>(userID, 'json') ?? []),
    {
      id,
      createdAt: Date.now(),
    }
  ]));
  return c.json({ id });
});

app.get("/c", requiresAuth(), async (c) => {
  const userID = c.var.oidc?.claims?.sub as string;
  const chats: ChatListItem[] = await c.env.ChatList.get<ChatListItem[]>(userID, 'json') ?? [];
  const chatsWithTitle = await Promise.all(chats.map(async (chat) => {
    const chatID = c.env.Chat.idFromName(chat.id);
    const stub = c.env.Chat.get(chatID);
    const title = await stub.getTitle();
    return {
      ...chat,
      title,
    };
  }));
  const sortedChats = chatsWithTitle.sort((a, b) => {
    return b.createdAt - a.createdAt;
  });
  return c.json(sortedChats);
});

app.get("/c/:chadID", requiresAuth(), async (c) => {
  const res = await c.env.ASSETS.fetch(new URL("/", c.req.url));
  return new Response(res.body, res);
});

app.use("/agents/*", requiresAuth('error'), async (c, next) => {
  const tokenSet = c.var.oidc?.tokens;
  const addToken = (req: Request) => {
    const accessToken = tokenSet?.access_token as string;
    req.headers.set("Authorization", `Bearer ${accessToken}`);
    return req;
  };
  return agentsMiddleware({
    options: {
      prefix: `agents`,
      async onBeforeRequest(req) {
        return addToken(req);
      },
      async onBeforeConnect(req, lobby) {
        return addToken(req);
      },
    },
    // @ts-ignore
  })(c, next);
});

app.use("*", async (c, next) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  return new Response(res.body, res);
});

export default app;
