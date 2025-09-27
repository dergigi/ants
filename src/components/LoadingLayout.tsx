interface LoadingLayoutProps {
  message: string;
}

export function LoadingLayout({ message }: LoadingLayoutProps) {
  return (
    <main className="min-h-screen bg-[#1a1a1a] text-gray-100">
      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
        <div className="text-sm text-gray-400">{message}</div>
      </div>
    </main>
  );
}
