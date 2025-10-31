// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

contract ProductRegistry {
    struct Product {
        string productId;
        string name;
        string price;
        string attributes;
        string isBidding;
        string isNegotiable;
        string owner;
        string createdAt;
    }

    mapping(string => Product) public products;

    event ProductRegistered(Product product);

    function registerProduct(Product calldata newProduct) external {
        products[newProduct.productId] = newProduct;
        emit ProductRegistered(newProduct);
    }
}
