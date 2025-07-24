const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());
    
    // Get the contract factory
    const DocumentSignature = await ethers.getContractFactory("DocumentSignature");
    
    // Deploy the contract
    console.log("Deploying DocumentSignature contract...");
    const documentSignature = await DocumentSignature.deploy();
    
    // Wait for deployment to complete
    await documentSignature.deployed();
    
    console.log("DocumentSignature deployed to:", documentSignature.address);
    console.log("Transaction hash:", documentSignature.deployTransaction.hash);
    
    // Wait for a few block confirmations
    console.log("Waiting for block confirmations...");
    await documentSignature.deployTransaction.wait(5);
    
    // Save contract address and ABI to files
    const contractInfo = {
        address: documentSignature.address,
        network: hre.network.name,
        deploymentBlock: documentSignature.deployTransaction.blockNumber,
        deployer: deployer.address,
        timestamp: new Date().toISOString()
    };
    
    // Create deployments directory if it doesn't exist
    const deploymentsDir = path.join(__dirname, '..', 'deployments');
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir);
    }
    
    // Save contract info
    fs.writeFileSync(
        path.join(deploymentsDir, `${hre.network.name}.json`),
        JSON.stringify(contractInfo, null, 2)
    );
    
    // Save ABI
    const artifact = await hre.artifacts.readArtifact("DocumentSignature");
    fs.writeFileSync(
        path.join(deploymentsDir, 'DocumentSignature.abi.json'),
        JSON.stringify(artifact.abi, null, 2)
    );
    
    console.log(`Contract info saved to deployments/${hre.network.name}.json`);
    console.log("ABI saved to deployments/DocumentSignature.abi.json");
    
    // Verify contract if on a supported network
    if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
        console.log("Contract deployed successfully!");
        console.log("Run the following command to verify:");
        console.log(`npx hardhat run scripts/verify.js --network ${hre.network.name}`);
    }
    
    // Display gas usage
    const receipt = await documentSignature.deployTransaction.wait();
    console.log("Gas used for deployment:", receipt.gasUsed.toString());
    
    return {
        contract: documentSignature,
        address: documentSignature.address,
        deployer: deployer.address
    };
}

// Execute deployment
main()
    .then((result) => {
        console.log("Deployment completed successfully!");
        process.exit(0);
    })
    .catch((error) => {
        console.error("Deployment failed:");
        console.error(error);
        process.exit(1);
    });