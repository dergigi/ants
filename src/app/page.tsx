import Image from "next/image";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-black text-white">
      <div className="w-full max-w-md space-y-4">
        <input
          type="text"
          placeholder="Search..."
          className="w-full px-4 py-2 text-black bg-white rounded focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
        <button
          className="w-full px-4 py-2 bg-white text-black rounded hover:bg-gray-100 transition-colors"
        >
          Search
        </button>
      </div>
    </main>
  );
}
