import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const provider = new ethers.JsonRpcProvider(
  process.env["GOOGLE_CLOUD_SEPOLIA_RPC_URL"] || ""
);
const wallet = new ethers.Wallet(process.env["PRIVATE_KEY"] || "", provider);

// Utility function to load contract data (ABI + address)
export function loadContractData(contractName: string) {
  const abiPath = path.resolve(
    `./src/blockchain/artifacts/contracts/${contractName}.sol/${contractName}.json`
  );
  const artifact = JSON.parse(fs.readFileSync(abiPath, "utf8"));

  const addresses = {
    ProductRegistry: "0x75b3FB22ef4967CC191910cfEF5956D176ECA0ba",
    ReceiptBook: "0xd29ca1d18E9E732D7D4398Ac90f371243222ae4a",
    ReviewAndRating: "0x995B3640E94C7048407E8291fd6a8133a14C2bDE",
  };

  const address = addresses[contractName as keyof typeof addresses];
  console.log("address", address);
  if (!address)
    throw new Error(`Contract address not found for ${contractName}`);

  return new ethers.Contract(address, artifact.abi, wallet);
}

loadContractData("ProductRegistry");
