'use client';

import React, { forwardRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';

type Props = {
  icon?: IconDefinition;
  children?: React.ReactNode;
  title: string;
  ariaLabel?: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  textSize?: 'text-[10px]' | 'text-[12px]';
};

const TitleBarButton = forwardRef<HTMLButtonElement, Props>(function TitleBarButton(
  { icon, children, title, ariaLabel, onClick, className, textSize = 'text-[12px]' },
  ref
) {
  const baseClasses = 'w-5 h-5 rounded-md bg-[#2a2a2a]/70 text-gray-200 border border-[#4a4a4a]/70 shadow-sm flex items-center justify-center leading-none hover:bg-[#3a3a3a]/80 hover:border-[#5a5a5a]/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-[#5a5a5a]/40';
  
  return (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel || title}
      title={title}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
      }}
      className={`${baseClasses} ${textSize} ${className || ''}`.trim()}
    >
      {icon ? <FontAwesomeIcon icon={icon} className="text-xs" /> : children}
    </button>
  );
});

export default TitleBarButton;
