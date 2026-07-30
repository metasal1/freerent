"use client";

type Props = { id: string };

/** Lightweight tweet CTA — avoids react-tweet crash when X omits empty entity arrays. */
export function SafeTweet({ id }: Props) {
  return (
    <a
      href={`https://x.com/i/status/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-cyan-400 transition-colors border border-gray-800 rounded-xl px-4 py-3 bg-gray-900/40"
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      See what people are saying on X
    </a>
  );
}
