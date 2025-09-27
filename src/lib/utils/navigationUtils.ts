import { useRouter } from 'next/navigation';

/**
 * Utility function to update search query in URL
 */
export function updateSearchQuery(
  searchParams: URLSearchParams,
  router: ReturnType<typeof useRouter>,
  query: string
): void {
  const params = new URLSearchParams(searchParams.toString());
  params.set('q', query);
  router.replace(`?${params.toString()}`);
}

/**
 * Hook-like utility for managing search query updates
 */
export function createSearchQueryUpdater(
  searchParams: URLSearchParams,
  router: ReturnType<typeof useRouter>,
  manageUrl: boolean
) {
  return (query: string) => {
    if (manageUrl) {
      updateSearchQuery(searchParams, router, query);
    }
  };
}
