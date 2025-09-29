import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';

interface SearchIconButtonProps {
  onClick: () => void;
  title: string;
  className?: string;
}

export default function SearchIconButton({ 
  onClick, 
  title, 
  className = "" 
}: SearchIconButtonProps) {
  return (
    <button
      type="button"
      className={`absolute top-1.5 right-1.5 z-10 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-300 bg-black/30 hover:bg-black/50 border border-gray-600/40 hover:border-gray-500/60 rounded-sm opacity-60 hover:opacity-100 transition-all duration-200 ${className}`}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <FontAwesomeIcon icon={faMagnifyingGlass} className="w-3 h-3" />
    </button>
  );
}
