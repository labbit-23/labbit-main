/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pre-existing setting -- this file previously had TWO separate
  // `module.exports = {...}` statements (reactStrictMode: false was in
  // the second, silently overriding the first's `experimental: {}` --
  // a real bug, found 2026-09-20 while adding the eslint setting below,
  // which was being silently discarded the same way). Consolidated into
  // one export; reactStrictMode: false was the one actually in effect
  // in production, kept as-is.
  reactStrictMode: false,
  experimental: {},
  // Security review, 2026-09-20: this repo had no eslint config at all
  // until this same review added one (for a separate `npm run lint` CI
  // step, priority 4). Without this flag, `next build` runs lint itself
  // and fails on a backlog of pre-existing errors (DataCell.js duplicate
  // props, unescaped-entity JSX in VisitDetailTab.js/YourDayView.js)
  // that were always there but silently un-linted -- discovered live
  // when this same change made a real production build fail. Same fix
  // labit-ui already applies for the same reason: lint runs as its own
  // CI step and can be triaged separately, not coupled to whether
  // `next build` (== deploys) succeeds.
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
