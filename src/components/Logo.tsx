'use client';

import Image from 'next/image';

interface LogoProps {
  size?: 'small' | 'large';
  className?: string;
  onClick?: () => void;
  isActive?: boolean;
}

export default function Logo({ size = 'small', className = '', onClick, isActive = false }: LogoProps) {
  const dimensions = size === 'large' ? { width: 40, height: 40, className: 'w-10 h-10' } : { width: 20, height: 20, className: 'w-5 h-5' };
  const logoSrc = isActive ? '/ants-blue.svg' : '/ants-gray.svg';
  const colorClass = isActive ? 'text-blue-400' : 'text-gray-400';
  
  return (
    <button
      onClick={onClick}
      className={`hover:opacity-90 transition-opacity ${className}`}
      aria-label="Go to home page"
    >
      <Image 
        src={logoSrc} 
        alt="ants menu" 
        width={dimensions.width}
        height={dimensions.height}
        className={`${dimensions.className} ${colorClass}`}
      />
    </button>
  );
}
