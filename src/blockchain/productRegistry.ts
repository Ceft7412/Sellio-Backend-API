import { loadContractData } from './index';

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
  const contract = loadContractData('ProductRegistry');
  if (!contract) {
    throw new Error('Failed to load ProductRegistry contract');
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

  const tx = await contract['registerProduct']!(productStruct);
  await tx.wait();
  return tx.hash;
}
