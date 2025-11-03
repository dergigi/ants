'use client';

import Image from 'next/image';

interface LogoProps {
  size?: 'small' | 'large';
  className?: string;
  onClick?: () => void;
  isActive?: boolean;
}

export default function Logo({ size = 'small', className = '', onClick, isActive = false }: LogoProps) {
  const dimensions = size === 'large' ? { width: 32, height: 32, className: 'w-8 h-8' } : { width: 20, height: 20, className: 'w-5 h-5' };
  const logoSrc = '/favicon-32x32.png';
  
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
        className={dimensions.className}
      />
    </button>
  );
}
