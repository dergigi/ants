import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faExternalLink } from '@fortawesome/free-solid-svg-icons';

interface ReverseImageSearchButtonProps {
  imageUrl: string;
  className?: string;
}

export default function ReverseImageSearchButton({ 
  imageUrl, 
  className = "" 
}: ReverseImageSearchButtonProps) {
  const handleReverseSearch = () => {
    const lensUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`;
    window.open(lensUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      type="button"
      className={`absolute top-1.5 left-1.5 z-10 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-300 bg-black/30 hover:bg-black/50 border border-gray-600/40 hover:border-gray-500/60 rounded-sm opacity-60 hover:opacity-100 transition-all duration-200 ${className}`}
      title="Reverse image search with Google Lens (external)"
      onClick={(e) => {
        e.stopPropagation();
        handleReverseSearch();
      }}
    >
      <div className="relative">
        <FontAwesomeIcon icon={faEye} className="w-3 h-3" />
        <FontAwesomeIcon icon={faExternalLink} className="absolute -top-1 -right-1 w-2 h-2 text-gray-400" />
      </div>
    </button>
  );
}
