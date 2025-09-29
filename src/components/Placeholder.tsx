'use client';

import React from 'react';

interface PlaceholderProps {
  className?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

// Base placeholder component with shimmer animation
const Placeholder: React.FC<PlaceholderProps> = ({ className = '', children, style }) => {
  return (
    <div 
      className={`bg-gray-700 animate-pulse rounded ${className}`}
      style={{
        background: 'linear-gradient(90deg, #374151 25%, #4B5563 50%, #374151 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        ...style
      }}
    >
      {children}
    </div>
  );
};

// Text placeholder with configurable lines
export const TextPlaceholder: React.FC<{ lines?: number; className?: string }> = ({ 
  lines = 1, 
  className = '' 
}) => {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Placeholder 
          key={i}
          className={`h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`}
        />
      ))}
    </div>
  );
};

// Circle placeholder (for avatars)
export const CirclePlaceholder: React.FC<{ size?: number; className?: string }> = ({ 
  size = 40, 
  className = '' 
}) => {
  return (
    <Placeholder 
      className={`rounded-full ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

// Rectangle placeholder (for images, cards)
export const RectPlaceholder: React.FC<{ 
  width?: number | string; 
  height?: number | string; 
  className?: string;
}> = ({ 
  width = '100%', 
  height = 200, 
  className = '' 
}) => {
  return (
    <Placeholder 
      className={`rounded ${className}`}
      style={{ width, height }}
    />
  );
};

// Profile card placeholder
export const ProfileCardPlaceholder: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg p-4 ${className}`}>
      <div className="flex items-start space-x-3">
        <CirclePlaceholder size={48} />
        <div className="flex-1 space-y-2">
          <Placeholder className="h-5 w-32" />
          <Placeholder className="h-4 w-24" />
          <TextPlaceholder lines={2} className="mt-2" />
        </div>
      </div>
    </div>
  );
};

// Event card placeholder
export const EventCardPlaceholder: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg p-4 ${className}`}>
      <div className="flex items-start space-x-3">
        <CirclePlaceholder size={40} />
        <div className="flex-1 space-y-3">
          <div className="flex items-center space-x-2">
            <Placeholder className="h-4 w-20" />
            <Placeholder className="h-4 w-16" />
          </div>
          <TextPlaceholder lines={3} />
          <div className="flex items-center justify-between">
            <div className="flex space-x-4">
              <Placeholder className="h-4 w-12" />
              <Placeholder className="h-4 w-12" />
            </div>
            <Placeholder className="h-4 w-16" />
          </div>
        </div>
      </div>
    </div>
  );
};

// Media placeholder for image/video searches
export const MediaPlaceholder: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg p-4 ${className}`}>
      <div className="space-y-3">
        <RectPlaceholder height={200} className="w-full" />
        <div className="flex items-start space-x-3">
          <CirclePlaceholder size={40} />
          <div className="flex-1 space-y-2">
            <Placeholder className="h-4 w-24" />
            <TextPlaceholder lines={2} />
          </div>
        </div>
      </div>
    </div>
  );
};

// Generic text results placeholder
export const TextResultsPlaceholder: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg p-4 ${className}`}>
      <div className="space-y-3">
        <TextPlaceholder lines={4} />
        <div className="flex items-center justify-between">
          <div className="flex space-x-4">
            <Placeholder className="h-4 w-12" />
            <Placeholder className="h-4 w-12" />
          </div>
          <Placeholder className="h-4 w-16" />
        </div>
      </div>
    </div>
  );
};

// Search results placeholder with dynamic type detection
export const SearchResultsPlaceholder: React.FC<{ 
  count?: number; 
  className?: string;
  searchType?: 'profile' | 'media' | 'text' | 'generic';
}> = ({ 
  count = 3, 
  className = '',
  searchType = 'generic'
}) => {
  const renderPlaceholder = () => {
    switch (searchType) {
      case 'profile':
        return <ProfileCardPlaceholder />;
      case 'media':
        return <MediaPlaceholder />;
      case 'text':
        return <TextResultsPlaceholder />;
      default:
        return <EventCardPlaceholder />;
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          {renderPlaceholder()}
        </div>
      ))}
    </div>
  );
};

// Add shimmer animation to global styles
export const PlaceholderStyles = () => (
  <style jsx global>{`
    @keyframes shimmer {
      0% {
        background-position: -200% 0;
      }
      100% {
        background-position: 200% 0;
      }
    }
  `}</style>
);

export default Placeholder;
