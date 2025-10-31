import { loadContractData } from './index';

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
  const contract = loadContractData('ReceiptBook');
  if (!contract) {
    throw new Error('Failed to load TransactionRegistry contract');
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

  const tx = await contract['issueReceipt']!(transactionStruct);
  await tx.wait();
  return tx.hash;
}
