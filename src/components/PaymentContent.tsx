"use client";

import { useEffect, useMemo, useState } from "react";
import type { NDKEvent } from "@nostr-dev-kit/ndk";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt, faUser } from "@fortawesome/free-solid-svg-icons";
import { ndk } from "@/lib/ndk";
import ProfileImage from "@/components/ProfileImage";
import { parsePayment } from "@/lib/payments";

function PaymentParty({
  pubkey,
  role,
  fallback,
  onAuthorClick,
}: {
  pubkey: string | null;
  role: "Sender" | "Recipient";
  fallback: string;
  onAuthorClick?: (npub: string) => void;
}) {
  const user = useMemo(
    () => (pubkey ? ndk.getUser({ pubkey }) : null),
    [pubkey],
  );
  const [, refresh] = useState(0);
  useEffect(() => {
    let active = true;
    if (user)
      user
        .fetchProfile()
        .then(() => {
          if (active) refresh((v) => v + 1);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);
  const label =
    user?.profile?.displayName ||
    user?.profile?.name ||
    (user ? `${user.npub.slice(0, 10)}…${user.npub.slice(-4)}` : fallback);
  const classes = `min-w-0 flex flex-col gap-2 ${role === "Sender" ? "items-start text-left" : "items-end text-right"}`;
  const content = (
    <>
      <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden bg-[#3d3d3d] flex items-center justify-center shrink-0">
        {user ? (
          <ProfileImage user={user} size={48} alt="" />
        ) : (
          <FontAwesomeIcon icon={faUser} className="text-gray-400" />
        )}
      </span>
      <span
        className={`w-full break-words line-clamp-2 text-xs sm:text-sm font-medium ${user ? "text-blue-400" : "text-gray-400"}`}
      >
        {label}
      </span>
    </>
  );
  return user ? (
    <Link
      href={`/p/${user.npub}`}
      className={`${classes} hover:opacity-80`}
      title={`${role}: ${label}`}
      aria-label={`${role}: ${label}`}
      onClick={(e) => {
        if (onAuthorClick) {
          e.preventDefault();
          onAuthorClick(user.npub);
        }
      }}
    >
      {content}
    </Link>
  ) : (
    <div className={classes} aria-label={`${role}: ${fallback}`}>
      {content}
    </div>
  );
}

export default function PaymentContent({
  event,
  onAuthorClick,
  renderContent,
}: {
  event: NDKEvent;
  onAuthorClick?: (npub: string) => void;
  renderContent: (content: string) => React.ReactNode;
}) {
  const payment = useMemo(() => parsePayment(event), [event]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const label = event.kind === 9735 ? "Zap" : "Nutzap";
  const accent = event.kind === 9735 ? "text-yellow-400" : "text-purple-400";
  return (
    <div data-testid="payment-content">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] gap-3 py-3 items-start">
        <PaymentParty
          pubkey={payment.sender}
          role="Sender"
          fallback={payment.anonymous ? "Anonymous" : "Unknown sender"}
          onAuthorClick={onAuthorClick}
        />
        <button
          type="button"
          className="min-w-0 flex flex-col items-center gap-2 py-1 rounded hover:bg-white/5"
          onClick={() => setDetailsOpen((v) => !v)}
          aria-expanded={detailsOpen}
          aria-label={`${label}: ${payment.amount ?? "unknown amount"} ${payment.amount ? payment.unit : ""}. Transaction details`}
        >
          <span
            className={`flex items-center justify-center gap-1.5 w-full font-bold text-2xl sm:text-3xl ${accent}`}
          >
            <FontAwesomeIcon icon={faBolt} className="shrink-0 w-4 sm:w-5" />
            <span
              className="truncate"
              title={payment.amount ?? "Unknown amount"}
            >
              {payment.amount ?? "—"}
            </span>
          </span>
          <span className="text-xs sm:text-sm text-gray-400 break-all">
            {payment.amount ? payment.unit : "Unknown amount"}
          </span>
        </button>
        <PaymentParty
          pubkey={payment.recipient}
          role="Recipient"
          fallback="Unknown recipient"
          onAuthorClick={onAuthorClick}
        />
      </div>
      {detailsOpen && (
        <div
          className="my-2 rounded border border-[#444] bg-[#262626] p-3 text-xs text-gray-300"
          role="note"
        >
          <p className="font-medium mb-1 break-all">
            {label} ·{" "}
            {payment.amount
              ? `${payment.amount} ${payment.unit}`
              : "Unknown amount"}
          </p>
          <p>Published amount; payment not independently verified.</p>
          {payment.mint && (
            <a
              className="mt-2 block text-blue-400 break-all hover:underline"
              href={payment.mint}
              target="_blank"
              rel="noopener noreferrer"
            >
              Mint: {new URL(payment.mint).host}
            </a>
          )}
        </div>
      )}
      {payment.comment.trim() && (
        <div className="mt-3 text-gray-100 whitespace-pre-wrap break-words">
          {renderContent(payment.comment)}
        </div>
      )}
    </div>
  );
}
