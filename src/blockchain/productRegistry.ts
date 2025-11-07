import { loadContractData } from "./index";
import { db } from "../db/connection";
import { productsTable } from "../db/schema";
import { eq } from "drizzle-orm";

export async function registerProductToBlockchain(
  productId: string,
  name: string,
  price: string,
  attributes: string,
  isBidding: string,
  isNegotiable: string,
  owner: string,
  createdAt: string
) {
  try {
    const contract = loadContractData("ProductRegistry");
    if (!contract) {
      throw new Error("Failed to load ProductRegistry contract");
    }

    const productStruct = {
      productId: productId,
      name: name,
      price: price,
      attributes: attributes,
      isBidding: isBidding,
      isNegotiable: isNegotiable,
      owner: owner,
      createdAt: createdAt,
    };

    const tx = await contract["registerProduct"]!(productStruct);
    await tx.wait();
    const hash = tx.hash;

    // Store blockchain hash in the products table
    await db
      .update(productsTable)
      .set({
        blockchain_address: hash,
        updatedAt: new Date(),
      })
      .where(eq(productsTable.id, productId));

    console.log(`✅ Product ${productId} registered to blockchain with hash: ${hash}`);
    return hash;
  } catch (error) {
    console.error(`❌ Error registering product ${productId} to blockchain:`, error);
    throw error;
  }
}
