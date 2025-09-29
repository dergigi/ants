import { ProfileCardPlaceholder, SearchResultsPlaceholder, PlaceholderStyles } from './Placeholder';

interface LoadingLayoutProps {
  message: string;
  showProfilePlaceholder?: boolean;
  showSearchPlaceholders?: boolean;
}

export function LoadingLayout({ 
  message, 
  showProfilePlaceholder = false, 
  showSearchPlaceholders = false 
}: LoadingLayoutProps) {
  return (
    <main className="min-h-screen bg-[#1a1a1a] text-gray-100">
      <PlaceholderStyles />
      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
        <div className="text-sm text-gray-400">{message}</div>
        {showProfilePlaceholder && <ProfileCardPlaceholder />}
                {showSearchPlaceholders && <SearchResultsPlaceholder count={2} />}
      </div>
    </main>
  );
}
