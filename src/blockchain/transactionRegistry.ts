import { loadContractData } from "./index.js";
import { db } from "../db/connection.js";
import { transactions } from "../db/schema.js";
import { eq } from "drizzle-orm";

export async function registerTransactionToBlockchain(
  transactionId: string,
  productId: string,
  buyerName: string,
  sellerName: string,
  amount: string,
  meetUpLocation: string,
  scheduledMeetUpAt: string,
  createdAt: string,
  status: string
) {
  try {
    const contract = loadContractData("ReceiptBook");
    if (!contract) {
      throw new Error("Failed to load TransactionRegistry contract");
    }

    const transactionStruct = {
      transactionId: transactionId,
      productId: productId,
      buyer: buyerName,
      seller: sellerName,
      amount: amount,
      meetUpLocation: meetUpLocation,
      scheduledMeetUpAt: scheduledMeetUpAt,
      createdAt: createdAt,
      status: status,
    };

    const tx = await contract["issueReceipt"]!(transactionStruct);
    await tx.wait();
    const hash = tx.hash;

    // Store blockchain hash in the transactions table
    await db
      .update(transactions)
      .set({
        blockchainTxHash: hash,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, transactionId));

    console.log(`✅ Transaction ${transactionId} registered to blockchain with hash: ${hash}`);
    return hash;
  } catch (error) {
    console.error(`❌ Error registering transaction ${transactionId} to blockchain:`, error);
    throw error;
  }
}
