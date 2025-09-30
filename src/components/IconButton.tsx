'use client';

import React, { forwardRef } from 'react';

type Props = {
  title: string;
  ariaLabel?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  children: React.ReactNode;
};

const baseClass = 'w-6 h-6 rounded-md text-gray-300 flex items-center justify-center text-[12px] leading-none hover:bg-[#3a3a3a]';

const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { title, ariaLabel, onClick, className, type = 'button', children }: Props,
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={ariaLabel || title}
      title={title}
      onClick={onClick}
      className={className ? `${baseClass} ${className}` : baseClass}
    >
      {children}
    </button>
  );
});

export default IconButton;


