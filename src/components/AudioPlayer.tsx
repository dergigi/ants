import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExternalLink, faMagnifyingGlass, faMusic } from '@fortawesome/free-solid-svg-icons';
import { getFilenameFromUrl, isAbsoluteHttpUrl } from '@/lib/utils/urlUtils';

interface AudioPlayerProps {
  src: string;
  onClickSearch?: () => void;
}

export default function AudioPlayer({ src, onClickSearch }: AudioPlayerProps) {
  if (!isAbsoluteHttpUrl(src)) {
    return null;
  }

  const extension = getFilenameFromUrl(src).match(/\.([a-z0-9]+)$/i)?.[1]?.toUpperCase();

  return (
    <div className="rounded-md border border-[#3d3d3d] bg-[#1f1f1f] p-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-gray-400">
        <span className="flex items-center gap-2 truncate">
          <FontAwesomeIcon icon={faMusic} className="text-[10px]" />
          {extension ? <span>{extension}</span> : null}
        </span>
        <div className="flex items-center gap-2">
          {onClickSearch ? (
            <button
              type="button"
              className="text-gray-400 transition-colors hover:text-gray-200"
              title="Search for this audio"
              onClick={(event) => {
                event.stopPropagation();
                onClickSearch();
              }}
            >
              <FontAwesomeIcon icon={faMagnifyingGlass} className="text-xs" />
            </button>
          ) : null}
          <button
            type="button"
            className="text-gray-400 transition-colors hover:text-gray-200"
            title="Open audio in new tab"
            onClick={(event) => {
              event.stopPropagation();
              window.open(src, '_blank', 'noopener,noreferrer');
            }}
          >
            <FontAwesomeIcon icon={faExternalLink} className="text-xs" />
          </button>
        </div>
      </div>
      <audio controls preload="metadata" className="w-full">
        <source src={src} />
        Your browser does not support the audio tag.
      </audio>
    </div>
  );
}
