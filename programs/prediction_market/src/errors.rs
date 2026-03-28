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

    #[msg("Platform treasury token account mint or owner does not match global config")]
    InvalidTreasuryAta,

    #[msg("Resolver has already voted; call revoke_resolution_vote before voting again")]
    AlreadyVoted,

    #[msg("No active vote to revoke")]
    NotVoted,

    #[msg("Outcome tally counter would overflow")]
    OutcomeTallyOverflow,

    #[msg("Outcome tally counter is zero")]
    OutcomeTallyEmpty,

    #[msg("mint_complete_set: remaining accounts must be [outcome_mint_i, user_ata_i] pairs; len = 2 * outcome_count")]
    InvalidMintCompleteSetRemainingAccounts,

    #[msg("Display name exceeds 50 bytes")]
    DisplayNameTooLong,

    #[msg("URL exceeds 100 bytes")]
    UrlTooLong,

    #[msg("Market title cannot be empty")]
    EmptyTitle,

    #[msg("Market title exceeds 128 bytes")]
    TitleTooLong,

    #[msg("Market category is inactive")]
    MarketCategoryInactive,

    #[msg("Market category name cannot be empty")]
    MarketCategoryNameEmpty,

    #[msg("Market category name exceeds max length")]
    MarketCategoryNameTooLong,

    #[msg("category_id must match global_config.next_category_id")]
    InvalidCategoryId,

    #[msg("This instruction requires a different market type")]
    WrongMarketType,

    #[msg("Parimutuel penalty or split parameters are invalid")]
    InvalidParimutuelPenalty,

    #[msg("Parimutuel state not initialized for this market")]
    ParimutuelNotInitialized,

    #[msg("Stake or withdrawal amount exceeds balance")]
    ParimutuelInsufficientStake,

    #[msg("Winning outcome pool is empty — cannot claim")]
    ParimutuelEmptyWinningPool,

    #[msg("Position already claimed")]
    ParimutuelAlreadyClaimed,
}
