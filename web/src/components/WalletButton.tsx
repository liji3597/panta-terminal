"use client";

import dynamic from "next/dynamic";

// WalletMultiButton touches `window` — client-only.
const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

export default function WalletButton() {
  return (
    <WalletMultiButton
      style={{
        height: 32,
        fontSize: 12,
        borderRadius: 8,
        background: "#059669",
        padding: "0 14px",
      }}
    />
  );
}
