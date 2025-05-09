import useSWR from "swr";

const titleFetcher = async (chatID: string) => {
  const response = await fetch(`/agents/chat/${chatID}/title`, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("An error occurred while fetching the title of the chat.");
  }

  return response.text();
};

export default function useChatTitle(chatID: string): {
  loading: boolean;
  title: string;
  mutate: () => void;
} {
  const { data, mutate, error } = useSWR(chatID, titleFetcher, {
    refreshInterval: 10000,
  });

  const loading = !data && !error;

  return {
    loading,
    mutate,
    title: data ?? "New Chat",
  };
}
