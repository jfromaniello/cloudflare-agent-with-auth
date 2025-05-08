// Component imports

// Icon imports
import useUser from "../hooks/useUser";
import { Layout } from "./Layout";

export default function Home() {
  const { user } = useUser();
  return <Layout>
    <Layout.Content>
      <p>Welcome to the Agents Demo!</p>
      {
        !user && (
          <p>
            Please log in to use the full features of the app. &nbsp;
            <a href="/login" className="text-blue-500 hover:underline">
              Log in
            </a>
          </p>
        )
      }
    </Layout.Content>
  </Layout>;
}
