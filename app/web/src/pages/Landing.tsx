import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg text-center">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-surface-900 sm:text-5xl">
          Set up your prediction market platform
        </h1>
        <p className="mt-4 text-lg text-surface-600">
          Configure your platform, create outcome markets, and let users mint and redeem.
          Connect your wallet to get started.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4">
          <WalletMultiButton className="!btn !btn-primary !h-12 !rounded-xl !px-8 !text-base" />
          <p className="text-sm text-surface-500">
            Phantom, Solflare, or any Solana wallet
          </p>
        </div>
        <div className="mt-16 grid grid-cols-2 gap-8 text-center sm:grid-cols-4">
          <div>
            <p className="font-semibold text-surface-900">Platform</p>
            <p className="mt-1 text-sm text-surface-500">Config, fees, allowlist</p>
          </div>
          <div>
            <p className="font-semibold text-surface-900">Create</p>
            <p className="mt-1 text-sm text-surface-500">Markets, 2–8 outcomes</p>
          </div>
          <div>
            <p className="font-semibold text-surface-900">Trade</p>
            <p className="mt-1 text-sm text-surface-500">Mint sets, redeem</p>
          </div>
          <div>
            <p className="font-semibold text-surface-900">Resolve</p>
            <p className="mt-1 text-sm text-surface-500">M-of-N resolver votes</p>
          </div>
        </div>
      </div>
    </div>
  );
}
