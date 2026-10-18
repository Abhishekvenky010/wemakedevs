import { Connection, PublicKey, ConfirmedSignatureInfo } from '@solana/web3.js';

// Types for our graph visualization
export interface NodeStyle {
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  opacity?: number;
  shadow?: boolean;
  gradient?: { from: string; to: string };
}

export interface Node {
  id: string;
  group: number;
  label: string;
  value: number;
  style?: NodeStyle;
  [key: string]: unknown;
}

export interface LinkStyle {
  color?: string;
  width?: number;
  opacity?: number;
  dasharray?: string;
  arrow?: boolean;
  arrowColor?: string;
  arrowSize?: number;
}

export interface Link {
  source: string;
  target: string;
  value: number;
  style?: LinkStyle;
  [key: string]: unknown;
}

export interface GraphStyle {
  backgroundColor?: string;
  linkDistance?: number;
  nodeRepulsion?: number;
  fontSize?: number;
  fontFamily?: string;
  animationDuration?: number;
}

export interface Graph {
  nodes: Node[];
  links: Link[];
  style?: GraphStyle;
}

// Process transactions into a graph structure
export async function processTransactions(
  walletAddress: string, 
  limit: number = 25
): Promise<Graph> {
  try {
    // Try multiple RPC endpoints in case one fails
    const rpcEndpoints = [
      'https://api.mainnet-beta.solana.com',
      'https://mainnet.helius-rpc.com/?api-key=c8a4b708-da1b-4f41-bcb2-57f1ef5537a6', // Alchemy demo endpoint
      'https://rpc.ankr.com/solana', // Ankr public endpoint
      'https://solana-api.projectserum.com' // Project Serum endpoint
    ];
    
    // Validate address format first
    let publicKey;
    try {
      publicKey = new PublicKey(walletAddress);
    } catch (err) {
      console.error('Invalid wallet address format:', err);
      throw new Error('Invalid wallet address format. Please check and try again.');
    }

    // Try each endpoint until one works
    let signatures: ConfirmedSignatureInfo[] = [];
    let connection;
    let lastError;
    
    for (const endpoint of rpcEndpoints) {
      try {
        console.log(`Trying RPC endpoint: ${endpoint}`);
        connection = new Connection(endpoint, 'confirmed');
        
        // Test the connection first
        await connection.getSlot();
        
        // Get transaction signatures for the wallet
        signatures = await connection.getSignaturesForAddress(
          publicKey,
          { limit }
        );
        
        console.log(`Successfully connected to ${endpoint}`);
        break; // Break the loop if successful
      } catch (error) {
        console.error(`Failed to use endpoint ${endpoint}:`, error);
        lastError = error;
      }
    }
    
    // If we've tried all endpoints and none worked
    if (signatures.length === 0) {
      if (lastError) {
        console.error('All RPC endpoints failed:', lastError);
        throw new Error('Unable to connect to Solana network. Please try again later.');
      }
      console.log('No transactions found for this wallet on mainnet');
      return { nodes: [], links: [] };
    }
    
    console.log(`Found ${signatures.length} transactions for wallet ${walletAddress}`);
    
    // Create a map to store unique nodes
    const nodesMap = new Map<string, Node>();
    
    // Add the main wallet as the first node
    nodesMap.set(walletAddress, {
      id: walletAddress,
      group: 1,
      label: `Wallet ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`,
      value: 100,
    });
    
    // Create links array
    const links: Link[] = [];
    
    // Process each transaction
    for (const signatureInfo of signatures) {
      const txId = signatureInfo.signature;
      
      try {
        // Get transaction details with increased commitment
        const tx = await connection!.getParsedTransaction(txId, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        });
        
        if (tx && tx.meta) {
          // Access the parsed message with accounts
          const accounts = tx.transaction.message.accountKeys.map(key => key.pubkey.toString());
          
          // Process each account
          for (let i = 0; i < accounts.length; i++) {
            const accountId = accounts[i];
            
            // Skip if we already have this node or if it's the wallet we're exploring
            if (!nodesMap.has(accountId) && accountId !== walletAddress) {
              // Determine if this is a program account (writeable flag is false)
              const isProgram = tx.transaction.message.accountKeys[i].signer === false && 
                               tx.transaction.message.accountKeys[i].writable === false;
              
              nodesMap.set(accountId, {
                id: accountId,
                group: isProgram ? 2 : 1, // Programs are group 2, wallets are group 1
                label: isProgram ? 
                  `Program ${accountId.slice(0, 4)}...${accountId.slice(-4)}` : 
                  `Wallet ${accountId.slice(0, 4)}...${accountId.slice(-4)}`,
                value: isProgram ? 150 : 80,
              });
            }
            
            // Create links for each account interaction
            if (accountId !== walletAddress && tx.meta) {
              const fee = tx.meta.fee;
              links.push({
                source: walletAddress,
                target: accountId,
                value: Math.max(1, fee / 10000), // Scale fee for visualization, minimum 1
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error processing transaction ${txId}:`, error);
        // Continue with other transactions even if one fails
      }
    }
    
    console.log(`Created graph with ${nodesMap.size} nodes and ${links.length} links`);
    
    // Return graph data
    return {
      nodes: Array.from(nodesMap.values()),
      links,
    };
  } catch (error) {
    console.error('Error processing transactions:', error);
    throw error; // Let the caller handle the error
  }
}

// Process transactions using Solscan API instead of direct RPC connections
export async function processSolscanTransactions(
  walletAddress: string,
  limit: number = 50
): Promise<Graph> {
  try {
    // Validate address format first
    try {
      new PublicKey(walletAddress);
    } catch (err) {
      console.error('Invalid wallet address format:', err);
      throw new Error('Invalid wallet address format. Please check and try again.');
    }

    console.log(`Fetching transactions for wallet ${walletAddress} from Solscan`);
    
    // Try different approach to get transaction data
    // Since the public API might have restrictions, we'll use a few different methods
    
    // First attempt: Try direct API with v1 route
    let response;
    let transactions = [];
    
    try {
      response = await fetch(`https://api.solscan.io/v1/account/transactions?account=${walletAddress}&limit=${limit}`);
      if (response.ok) {
        const data = await response.json();
        transactions = data.data || [];
      } else {
        console.log(`First attempt failed: ${response.status}. Trying alternative endpoint...`);
      }
    } catch (error) {
      console.error("First API attempt failed:", error);
    }
    
    // Second attempt: Try alternative API route if first failed
    if (transactions.length === 0) {
      try {
        response = await fetch(`https://api.solscan.io/account/transactions?account=${walletAddress}&limit=${limit}`);
        if (response.ok) {
          const data = await response.json();
          transactions = data.data || data || [];
        } else {
          console.log(`Second attempt failed: ${response.status}. Trying with CORS proxy...`);
        }
      } catch (error) {
        console.error("Second API attempt failed:", error);
      }
    }
    
    // Third attempt: Use a CORS proxy if previous attempts failed
    if (transactions.length === 0) {
      try {
        const corsProxy = "https://corsproxy.io/?";
        response = await fetch(`${corsProxy}https://api.solscan.io/account/transactions?account=${walletAddress}&limit=${limit}`);
        if (response.ok) {
          const data = await response.json();
          transactions = data.data || data || [];
        } else {
          console.log(`Third attempt failed: ${response.status}.`);
        }
      } catch (error) {
        console.error("Third API attempt failed:", error);
      }
    }
    
    if (!Array.isArray(transactions) || transactions.length === 0) {
      console.log('Unable to fetch transactions from Solscan. No graph data available.');
      return { nodes: [], links: [] };
    }
    
    console.log(`Found ${transactions.length} transactions on Solscan`);
    
    // Create a map to store unique nodes
    const nodesMap = new Map<string, Node>();
    
    // Add the main wallet as the first node
    nodesMap.set(walletAddress, {
      id: walletAddress,
      group: 1,
      label: `Wallet ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`,
      value: 100,
    });
    
    // Create links array
    const links: Link[] = [];
    
    // Process each transaction 
    // Note: API response format may vary, so we need to handle different structures
    for (const tx of transactions) {
      try {
        // Handle different response formats
        const txData = tx.tx || tx;
        
        // Extract accounts/programs (structure depends on API response)
        const accounts = new Set<string>();
        const programs = new Set<string>();
        
        // Add accounts and programs based on what's available in the response
        // Check various fields that might contain relevant data
        if (txData.signer && Array.isArray(txData.signer)) {
          txData.signer.forEach((account: string) => accounts.add(account));
        }
        
        if (txData.accounts && Array.isArray(txData.accounts)) {
          txData.accounts.forEach((account: string) => accounts.add(account));
        }
        
        if (txData.instructions && Array.isArray(txData.instructions)) {
          txData.instructions.forEach((instruction: any) => {
            if (instruction.programId) programs.add(instruction.programId);
          });
        }
        
        // Process accounts
        accounts.forEach(account => {
          if (account !== walletAddress && !nodesMap.has(account)) {
            nodesMap.set(account, {
              id: account,
              group: 1, // Wallets are group 1
              label: `Wallet ${account.slice(0, 4)}...${account.slice(-4)}`,
              value: 80,
            });
            
            // Create a link for wallet interactions
            links.push({
              source: walletAddress,
              target: account,
              value: 5, // Default value for wallet connections
            });
          }
        });
        
        // Process programs
        programs.forEach(programId => {
          if (!nodesMap.has(programId)) {
            nodesMap.set(programId, {
              id: programId,
              group: 2, // Programs are group 2
              label: `Program ${programId.slice(0, 4)}...${programId.slice(-4)}`,
              value: 150,
            });
            
            // Create a link for program interactions
            links.push({
              source: walletAddress,
              target: programId,
              value: 10, // Make program connections thicker
            });
          }
        });
      } catch (error) {
        console.error(`Error processing transaction:`, error);
        // Continue with other transactions even if one fails
      }
    }
    
    if (nodesMap.size <= 1) {
      console.log('Could not extract meaningful data from transactions.');
      return { nodes: [], links: [] };
    }
    
    console.log(`Created graph with ${nodesMap.size} nodes and ${links.length} links from Solscan data`);
    
    // Return graph data
    return {
      nodes: Array.from(nodesMap.values()),
      links,
    };
  } catch (error) {
    console.error('Error processing Solscan transactions:', error);
    return { nodes: [], links: [] };
  }
}