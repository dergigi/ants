'use client';

import React from 'react';

type Props = {
  className?: string;
};

// Lightweight result skeleton matching EventCard/ProfileCard container styles
export default function ResultSkeleton({ className = '' }: Props) {
  return (
    <div className={`relative p-4 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg ${className}`.trim()}>
      <div className="animate-pulse">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-full bg-[#3a3a3a]" />
          <div className="flex-1">
            <div className="h-3 w-40 bg-[#3a3a3a] rounded" />
            <div className="h-3 w-24 bg-[#3a3a3a] rounded mt-2" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 w-11/12 bg-[#3a3a3a] rounded" />
          <div className="h-3 w-10/12 bg-[#3a3a3a] rounded" />
          <div className="h-3 w-9/12 bg-[#3a3a3a] rounded" />
        </div>
        <div className="mt-4 h-40 bg-[#303030] rounded-md" />
      </div>
    </div>
  );
}


