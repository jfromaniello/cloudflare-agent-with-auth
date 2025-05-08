// Component imports

// Icon imports
import ChatList from "@/components/chatList";
import useUser from "../hooks/useUser";
import { Layout } from "./Layout";
import { useNavigate } from "react-router";

export default function Home() {
  const { user } = useUser();
  const navigate = useNavigate();

  const createNewChat = async () => {
    // const newThread = generateId();
    const createChatResponse = await fetch("/c", {
      method: "POST",
      credentials: "include",
    });
    const { id } = (await createChatResponse.json()) as { id: string };
    navigate(`/c/${id}`);
  };

  return (
    <Layout>
      <Layout.Content>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24 max-h-[calc(100vh-10rem)]">
          <p>Welcome to the Agents Demo!</p>
          {!user && (
            <p>
              Please log in to use the full features of the app. &nbsp;
              <a href="/login" className="text-blue-500 hover:underline">
                Log in
              </a>
            </p>
          )}

          {user && (
            <>
              <button
                onClick={() => createNewChat()}
                className="text-sm font-medium py-2 px-4 rounded-lg shadow transition cursor-pointer"
              >
                New Chat
              </button>
              <ChatList />
            </>
          )}
        </div>
      </Layout.Content>
    </Layout>
  );
}
