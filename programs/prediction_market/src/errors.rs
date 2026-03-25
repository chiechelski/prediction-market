use anchor_lang::prelude::*;

#[error_code]
pub enum PredictionMarketError {
    #[msg("Global config can only be updated by authority")]
    ConfigUnauthorized,

    #[msg("Collateral mint is not on the allowlist")]
    MintNotAllowed,

    #[msg("Market is closed (early or past close_at)")]
    MarketClosed,

    #[msg("Market is not closed yet")]
    MarketNotClosed,

    #[msg("Market is already resolved")]
    MarketAlreadyResolved,

    #[msg("Market is voided")]
    MarketVoided,

    #[msg("Market is not voided")]
    MarketNotVoided,

    #[msg("Market is not resolved")]
    MarketNotResolved,

    #[msg("Cannot void an already resolved market")]
    CannotVoidResolvedMarket,

    #[msg("Invalid outcome index")]
    InvalidOutcomeIndex,

    #[msg("Signer is not a resolver for this market")]
    NotResolver,

    #[msg("Only creator or resolver can perform this action")]
    OnlyCreatorOrResolver,

    #[msg("Platform fee + creator fee must not exceed 10000 bps")]
    InvalidFeeBps,

    #[msg("Close time must be in the future")]
    CloseAtMustBeInFuture,

    #[msg("Mint amount must be greater than zero")]
    ZeroMintAmount,

    #[msg("Invalid resolution threshold (M must be <= number of resolvers)")]
    InvalidResolutionThreshold,
}
