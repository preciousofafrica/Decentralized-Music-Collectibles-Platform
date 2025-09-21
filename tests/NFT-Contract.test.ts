import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV, bufferCV, principalCV, BooleanCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_EDITION_LIMIT = 101;
const ERR_INVALID_TITLE = 102;
const ERR_INVALID_DESCRIPTION = 103;
const ERR_INVALID_FILE_HASH = 104;
const ERR_MAX_EDITION_REACHED = 105;
const ERR_NO_NFT = 106;
const ERR_NOT_OWNER = 107;
const ERR_INVALID_TOKEN_ID = 108;
const ERR_METADATA_FROZEN = 109;
const ERR_INVALID_ROYALTY_RATE = 110;
const ERR_INVALID_ROYALTY_RECIPIENT = 111;
const ERR_ALREADY_BURNED = 112;
const ERR_INVALID_UPDATE = 114;
const ERR_MAX_TOKENS_EXCEEDED = 115;
const ERR_INVALID_MINT_FEE = 116;
const ERR_AUTHORITY_NOT_SET = 117;
const ERR_INVALID_AUTHORITY = 118;

interface NFTMetadata {
  creator: string;
  title: string;
  description: string;
  fileHash: Uint8Array;
  editionLimit: number;
  editionCount: number;
  timestamp: number;
  royaltyRate: number;
  royaltyRecipient: string;
  status: boolean;
  frozen: boolean;
}

interface RoyaltyHistory {
  rate: number;
  recipient: string;
  updateTimestamp: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class MusicNFTMock {
  state: {
    lastTokenId: number;
    maxTokens: number;
    mintFee: number;
    authorityPrincipal: string | null;
    nfts: Map<number, string | null>;
    nftMetadata: Map<number, NFTMetadata>;
    nftRoyaltyHistory: Map<number, RoyaltyHistory>;
  } = {
    lastTokenId: 0,
    maxTokens: 10000,
    mintFee: 500,
    authorityPrincipal: null,
    nfts: new Map(),
    nftMetadata: new Map(),
    nftRoyaltyHistory: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1CREATOR";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  prints: Array<{ event: string; [key: string]: any }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      lastTokenId: 0,
      maxTokens: 10000,
      mintFee: 500,
      authorityPrincipal: null,
      nfts: new Map(),
      nftMetadata: new Map(),
      nftRoyaltyHistory: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1CREATOR";
    this.stxTransfers = [];
    this.prints = [];
  }

  setAuthority(newAuthority: string): Result<boolean> {
    if (this.state.authorityPrincipal !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityPrincipal = newAuthority;
    return { ok: true, value: true };
  }

  setMintFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.authorityPrincipal) {
      return { ok: false, value: false };
    }
    if (newFee <= 0) {
      return { ok: false, value: false };
    }
    this.state.mintFee = newFee;
    return { ok: true, value: true };
  }

  setMaxTokens(newMax: number): Result<boolean> {
    if (this.caller !== this.state.authorityPrincipal) {
      return { ok: false, value: false };
    }
    if (newMax <= this.state.lastTokenId) {
      return { ok: false, value: false };
    }
    this.state.maxTokens = newMax;
    return { ok: true, value: true };
  }

  mintNft(
    title: string,
    description: string,
    fileHash: Uint8Array,
    editionLimit: number,
    royaltyRate: number,
    royaltyRecipient: string
  ): Result<number> {
    if (this.state.lastTokenId >= this.state.maxTokens) {
      return { ok: false, value: ERR_MAX_TOKENS_EXCEEDED };
    }
    if (title.length === 0 || title.length > 100) {
      return { ok: false, value: ERR_INVALID_TITLE };
    }
    if (description.length > 256) {
      return { ok: false, value: ERR_INVALID_DESCRIPTION };
    }
    if (fileHash.length !== 32) {
      return { ok: false, value: ERR_INVALID_FILE_HASH };
    }
    if (editionLimit <= 0 || editionLimit > 1000) {
      return { ok: false, value: ERR_INVALID_EDITION_LIMIT };
    }
    if (royaltyRate > 20) {
      return { ok: false, value: ERR_INVALID_ROYALTY_RATE };
    }
    if (royaltyRecipient === this.caller) {
      return { ok: false, value: ERR_INVALID_ROYALTY_RECIPIENT };
    }
    if (!this.state.authorityPrincipal) {
      return { ok: false, value: ERR_AUTHORITY_NOT_SET };
    }
    this.stxTransfers.push({ amount: this.state.mintFee, from: this.caller, to: this.state.authorityPrincipal });
    const newId = this.state.lastTokenId + 1;
    this.state.nfts.set(newId, this.caller);
    this.state.nftMetadata.set(newId, {
      creator: this.caller,
      title,
      description,
      fileHash,
      editionLimit,
      editionCount: 1,
      timestamp: this.blockHeight,
      royaltyRate,
      royaltyRecipient,
      status: true,
      frozen: false,
    });
    this.state.nftRoyaltyHistory.set(newId, {
      rate: royaltyRate,
      recipient: royaltyRecipient,
      updateTimestamp: this.blockHeight,
    });
    this.state.lastTokenId = newId;
    this.prints.push({ event: "nft-minted", id: newId });
    return { ok: true, value: newId };
  }

  transferNft(tokenId: number, recipient: string): Result<boolean> {
    const owner = this.state.nfts.get(tokenId);
    if (!owner) {
      return { ok: false, value: ERR_NO_NFT };
    }
    if (this.caller !== owner) {
      return { ok: false, value: ERR_NOT_OWNER };
    }
    this.state.nfts.set(tokenId, recipient);
    this.prints.push({ event: "nft-transferred", id: tokenId, to: recipient });
    return { ok: true, value: true };
  }

  burnNft(tokenId: number): Result<boolean> {
    const owner = this.state.nfts.get(tokenId);
    if (!owner) {
      return { ok: false, value: ERR_NO_NFT };
    }
    if (this.caller !== owner) {
      return { ok: false, value: ERR_NOT_OWNER };
    }
    const meta = this.state.nftMetadata.get(tokenId);
    if (!meta || !meta.status) {
      return { ok: false, value: ERR_ALREADY_BURNED };
    }
    this.state.nfts.set(tokenId, null);
    this.state.nftMetadata.set(tokenId, { ...meta, status: false });
    this.prints.push({ event: "nft-burned", id: tokenId });
    return { ok: true, value: true };
  }

  updateRoyalty(tokenId: number, newRate: number, newRecipient: string): Result<boolean> {
    const meta = this.state.nftMetadata.get(tokenId);
    if (!meta) {
      return { ok: false, value: ERR_NO_NFT };
    }
    const owner = this.state.nfts.get(tokenId);
    if (!owner) {
      return { ok: false, value: ERR_NO_NFT };
    }
    if (this.caller !== owner) {
      return { ok: false, value: ERR_NOT_OWNER };
    }
    if (meta.frozen) {
      return { ok: false, value: ERR_METADATA_FROZEN };
    }
    if (newRate > 20) {
      return { ok: false, value: ERR_INVALID_ROYALTY_RATE };
    }
    if (newRecipient === this.caller) {
      return { ok: false, value: ERR_INVALID_ROYALTY_RECIPIENT };
    }
    this.state.nftMetadata.set(tokenId, { ...meta, royaltyRate: newRate, royaltyRecipient: newRecipient });
    this.state.nftRoyaltyHistory.set(tokenId, { rate: newRate, recipient: newRecipient, updateTimestamp: this.blockHeight });
    this.prints.push({ event: "royalty-updated", id: tokenId });
    return { ok: true, value: true };
  }

  freezeMetadata(tokenId: number): Result<boolean> {
    const meta = this.state.nftMetadata.get(tokenId);
    if (!meta) {
      return { ok: false, value: ERR_NO_NFT };
    }
    const owner = this.state.nfts.get(tokenId);
    if (!owner) {
      return { ok: false, value: ERR_NO_NFT };
    }
    if (this.caller !== owner) {
      return { ok: false, value: ERR_NOT_OWNER };
    }
    if (meta.frozen) {
      return { ok: false, value: ERR_METADATA_FROZEN };
    }
    this.state.nftMetadata.set(tokenId, { ...meta, frozen: true });
    this.prints.push({ event: "metadata-frozen", id: tokenId });
    return { ok: true, value: true };
  }

  mintEdition(tokenId: number): Result<number> {
    const meta = this.state.nftMetadata.get(tokenId);
    if (!meta) {
      return { ok: false, value: ERR_NO_NFT };
    }
    if (this.caller !== meta.creator) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (meta.editionCount >= meta.editionLimit) {
      return { ok: false, value: ERR_MAX_EDITION_REACHED };
    }
    const newEditionId = this.state.lastTokenId + 1;
    this.state.nfts.set(newEditionId, this.caller);
    this.state.nftMetadata.set(newEditionId, { ...meta });
    this.state.nftMetadata.set(tokenId, { ...meta, editionCount: meta.editionCount + 1 });
    this.state.lastTokenId = newEditionId;
    this.prints.push({ event: "edition-minted", originalId: tokenId, newId: newEditionId });
    return { ok: true, value: newEditionId };
  }

  getNftMetadata(tokenId: number): NFTMetadata | null {
    return this.state.nftMetadata.get(tokenId) || null;
  }

  getNftRoyaltyHistory(tokenId: number): RoyaltyHistory | null {
    return this.state.nftRoyaltyHistory.get(tokenId) || null;
  }

  getLastTokenId(): Result<number> {
    return { ok: true, value: this.state.lastTokenId };
  }

  getOwner(tokenId: number): Result<string | null> {
    return { ok: true, value: this.state.nfts.get(tokenId) || null };
  }

  verifyOwnership(tokenId: number, owner: string): Result<boolean> {
    const currentOwner = this.state.nfts.get(tokenId);
    return { ok: true, value: currentOwner === owner };
  }

  isMetadataFrozen(tokenId: number): Result<boolean> {
    const meta = this.state.nftMetadata.get(tokenId);
    return { ok: true, value: meta ? meta.frozen : false };
  }
}

describe("MusicNFT Contract", () => {
  let contract: MusicNFTMock;

  beforeEach(() => {
    contract = new MusicNFTMock();
    contract.reset();
  });

  it("sets authority successfully", () => {
    const result = contract.setAuthority("ST2AUTH");
    expect(result.ok).toBe(true);
    expect(contract.state.authorityPrincipal).toBe("ST2AUTH");
  });

  it("rejects setting authority if already set", () => {
    contract.setAuthority("ST2AUTH");
    const result = contract.setAuthority("ST3NEW");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets mint fee successfully", () => {
    contract.setAuthority("ST2AUTH");
    contract.caller = "ST2AUTH";
    const result = contract.setMintFee(1000);
    expect(result.ok).toBe(true);
    expect(contract.state.mintFee).toBe(1000);
  });

  it("rejects invalid mint fee", () => {
    contract.setAuthority("ST2AUTH");
    contract.caller = "ST2AUTH";
    const result = contract.setMintFee(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets max tokens successfully", () => {
    contract.setAuthority("ST2AUTH");
    contract.caller = "ST2AUTH";
    const result = contract.setMaxTokens(20000);
    expect(result.ok).toBe(true);
    expect(contract.state.maxTokens).toBe(20000);
  });

  it("rejects invalid max tokens update", () => {
    contract.setAuthority("ST2AUTH");
    contract.caller = "ST2AUTH";
    const result = contract.setMaxTokens(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("mints NFT successfully", () => {
    contract.setAuthority("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(0);
    const result = contract.mintNft("Track1", "Desc", fileHash, 10, 5, "ST3RECIP");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
    const meta = contract.getNftMetadata(1);
    expect(meta?.title).toBe("Track1");
    expect(meta?.royaltyRate).toBe(5);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1CREATOR", to: "ST2AUTH" }]);
    expect(contract.prints).toEqual([{ event: "nft-minted", id: 1 }]);
  });

  it("rejects mint without authority", () => {
    const fileHash = new Uint8Array(32).fill(0);
    const result = contract.mintNft("Track1", "Desc", fileHash, 10, 5, "ST3RECIP");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_SET);
  });

  it("rejects invalid title", () => {
    contract.setAuthority("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(0);
    const result = contract.mintNft("", "Desc", fileHash, 10, 5, "ST3RECIP");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TITLE);
  });

  it("transfers NFT successfully", () => {
    contract.setAuthority("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(0);
    contract.mintNft("Track1", "Desc", fileHash, 10, 5, "ST3RECIP");
    const result = contract.transferNft(1, "ST4NEWOWNER");
    expect(result.ok).toBe(true);
    expect(contract.getOwner(1).value).toBe("ST4NEWOWNER");
    expect(contract.prints[1]).toEqual({ event: "nft-transferred", id: 1, to: "ST4NEWOWNER" });
  });

  it("rejects transfer by non-owner", () => {
    contract.setAuthority("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(0);
    contract.mintNft("Track1", "Desc", fileHash, 10, 5, "ST3RECIP");
    contract.caller = "ST5FAKE";
    const result = contract.transferNft(1, "ST4NEWOWNER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_OWNER);
  });

  it("burns NFT successfully", () => {
    contract.setAuthority("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(0);
    contract.mintNft("Track1", "Desc", fileHash, 10, 5, "ST3RECIP");
    const result = contract.burnNft(1);
    expect(result.ok).toBe(true);
    expect(contract.getOwner(1).value).toBe(null);
    const meta = contract.getNftMetadata(1);
    expect(meta?.status).toBe(false);
    expect(contract.prints[1]).toEqual({ event: "nft-burned", id: 1 });
  });

  it("updates royalty successfully", () => {
    contract.setAuthority("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(0);
    contract.mintNft("Track1", "Desc", fileHash, 10, 5, "ST3RECIP");
    const result = contract.updateRoyalty(1, 10, "ST6NEWRECIP");
    expect(result.ok).toBe(true);
    const meta = contract.getNftMetadata(1);
    expect(meta?.royaltyRate).toBe(10);
    expect(meta?.royaltyRecipient).toBe("ST6NEWRECIP");
    const history = contract.getNftRoyaltyHistory(1);
    expect(history?.rate).toBe(10);
    expect(contract.prints[1]).toEqual({ event: "royalty-updated", id: 1 });
  });

  it("rejects royalty update on frozen metadata", () => {
    contract.setAuthority("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(0);
    contract.mintNft("Track1", "Desc", fileHash, 10, 5, "ST3RECIP");
    contract.freezeMetadata(1);
    const result = contract.updateRoyalty(1, 10, "ST6NEWRECIP");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_METADATA_FROZEN);
  });

  it("freezes metadata successfully", () => {
    contract.setAuthority("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(0);
    contract.mintNft("Track1", "Desc", fileHash, 10, 5, "ST3RECIP");
    const result = contract.freezeMetadata(1);
    expect(result.ok).toBe(true);
    const frozen = contract.isMetadataFrozen(1);
    expect(frozen.value).toBe(true);
    expect(contract.prints[1]).toEqual({ event: "metadata-frozen", id: 1 });
  });

  it("rejects freezing already frozen metadata", () => {
    contract.setAuthority("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(0);
    contract.mintNft("Track1", "Desc", fileHash, 10, 5, "ST3RECIP");
    contract.freezeMetadata(1);
    const result = contract.freezeMetadata(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_METADATA_FROZEN);
  });

  it("mints edition successfully", () => {
    contract.setAuthority("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(0);
    contract.mintNft("Track1", "Desc", fileHash, 10, 5, "ST3RECIP");
    const result = contract.mintEdition(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
    const meta1 = contract.getNftMetadata(1);
    expect(meta1?.editionCount).toBe(2);
    const meta2 = contract.getNftMetadata(2);
    expect(meta2?.title).toBe("Track1");
    expect(contract.prints[1]).toEqual({ event: "edition-minted", originalId: 1, newId: 2 });
  });

  it("rejects minting edition beyond limit", () => {
    contract.setAuthority("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(0);
    contract.mintNft("Track1", "Desc", fileHash, 1, 5, "ST3RECIP");
    const result = contract.mintEdition(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_EDITION_REACHED);
  });

  it("gets last token ID correctly", () => {
    contract.setAuthority("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(0);
    contract.mintNft("Track1", "Desc", fileHash, 10, 5, "ST3RECIP");
    const result = contract.getLastTokenId();
    expect(result.value).toBe(1);
  });

  it("verifies ownership correctly", () => {
    contract.setAuthority("ST2AUTH");
    const fileHash = new Uint8Array(32).fill(0);
    contract.mintNft("Track1", "Desc", fileHash, 10, 5, "ST3RECIP");
    const result = contract.verifyOwnership(1, "ST1CREATOR");
    expect(result.value).toBe(true);
    const result2 = contract.verifyOwnership(1, "ST5FAKE");
    expect(result2.value).toBe(false);
  });
});