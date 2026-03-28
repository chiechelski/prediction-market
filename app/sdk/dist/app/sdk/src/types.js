"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toMarketTypeIx = toMarketTypeIx;
function toMarketTypeIx(marketType) {
    if (marketType === 'parimutuel') {
        return { parimutuel: {} };
    }
    return { completeSet: {} };
}
//# sourceMappingURL=types.js.map