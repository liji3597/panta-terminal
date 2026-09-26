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
        height: 34,
        fontSize: 13,
        fontWeight: 500,
        borderRadius: 9999,
        background: "#d97757",
        padding: "0 18px",
      }}
    />
  );
}
