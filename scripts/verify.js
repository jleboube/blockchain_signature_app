const { run } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
    // Load deployment info
    const deploymentPath = path.join(__dirname, '..', 'deployments', `${hre.network.name}.json`);
    
    if (!fs.existsSync(deploymentPath)) {
        console.error(`No deployment found for network ${hre.network.name}`);
        console.error(`Expected file: ${deploymentPath}`);
        process.exit(1);
    }
    
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    const contractAddress = deployment.address;
    
    console.log(`Verifying contract at ${contractAddress} on ${hre.network.name}`);
    
    try {
        await run("verify:verify", {
            address: contractAddress,
            constructorArguments: [],
            contract: "contracts/DocumentSignature.sol:DocumentSignature"
        });
        
        console.log("Contract verified successfully!");
        
    } catch (error) {
        if (error.message.includes("Already Verified")) {
            console.log("Contract is already verified!");
        } else {
            console.error("Verification failed:");
            console.error(error.message);
            
            // Common troubleshooting tips
            console.log("\nTroubleshooting tips:");
            console.log("1. Make sure you're using the correct network");
            console.log("2. Wait a few minutes after deployment before verifying");
            console.log("3. Check that your API key is configured correctly");
            console.log("4. Ensure the contract source matches exactly");
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });