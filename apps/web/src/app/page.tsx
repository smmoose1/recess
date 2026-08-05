import { AuthProvider } from "@/components/AuthProvider";
import { DiscoverFeed } from "@/components/DiscoverFeed";

export default function HomePage() {
  return (
    <AuthProvider>
      <DiscoverFeed />
    </AuthProvider>
  );
}
