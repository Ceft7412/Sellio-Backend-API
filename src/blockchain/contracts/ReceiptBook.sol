// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract ReceiptBook {
    struct Receipt {
        string transactionId;
        string productId;
        string buyer;
        string seller;
        string amount;
        string meetUpLocation;
        string scheduledMeetUpAt;
        string createdAt;
        string status;
    }

    mapping(string => Receipt) public receipts;

    // Emit the full struct as a single argument (ABI encodes it cleanly)
    event ReceiptIssued(Receipt receipt);

    function issueReceipt(Receipt calldata newReceipt) external {
        // Store the receipt in the mapping
        receipts[newReceipt.transactionId] = newReceipt;

        // Emit the struct as the event payload
        emit ReceiptIssued(newReceipt);
    }
}
