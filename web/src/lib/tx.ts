"use client";

import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

/** Compile Panta's instruction list into a v0 transaction the wallet can sign. */
export function compileTx(build: any, payer: PublicKey): VersionedTransaction {
  const instructions = (build.instructions as any[]).map(
    (ix) =>
      new TransactionInstruction({
        programId: new PublicKey(ix.programId),
        keys: (ix.accounts as any[]).map((a) => ({
          pubkey: new PublicKey(a.pubkey),
          isSigner: a.isSigner,
          isWritable: a.isWritable,
        })),
        data: Buffer.from(ix.data, "base64"),
      }),
  );
  const msg = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: build.recentBlockhash,
    instructions,
  }).compileToV0Message();
  return new VersionedTransaction(msg);
}
