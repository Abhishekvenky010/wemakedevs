import type { FormEvent } from "react";
import type { InvestigationDepth } from "@/lib/risk/api";
import { cn } from "@/lib/cn";
import Card from "@/components/ui/Card";
import Alert from "@/components/ui/Alert";
import Icon from "@/components/ui/Icon";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Spinner } from "@/components/ui/LoadingState";

const depthOptions: Array<{
  value: InvestigationDepth;
  label: string;
  description: string;
}> = [
  { value: 0, label: "0 hops", description: "Initial wallet only" },
  { value: 1, label: "1 hop", description: "Direct counterparties" },
  { value: 2, label: "2 hops", description: "Expand one more level" },
  { value: 3, label: "3 hops", description: "Deepest supported scan" },
];

interface InvestigationFormProps {
  address: string;
  onAddressChange: (value: string) => void;
  depth: InvestigationDepth;
  onDepthChange: (value: InvestigationDepth) => void;
  loading: boolean;
  validationError: string | null;
  error: string | null;
  errorStage: "ingestion" | "report" | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRetry: () => void;
}

export default function InvestigationForm({
  address,
  onAddressChange,
  depth,
  onDepthChange,
  loading,
  validationError,
  error,
  errorStage,
  onSubmit,
  onRetry,
}: InvestigationFormProps) {
  return (
    <Card>
      <SectionHeading
        icon="search"
        title="Investigate a wallet"
        description="Fetch real Solana transfers, persist them to FalkorDB, and run the graph investigation pipeline."
        action={
          <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:inline-flex">
            Step 01
          </span>
        }
      />

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <div>
            <label
              htmlFor="wallet-address"
              className="flex items-center gap-2 text-sm font-semibold text-slate-800"
            >
              Public Solana wallet address
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-600">
                Required
              </span>
            </label>
            <div className="relative mt-2">
              <Icon
                name="wallet"
                size={18}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                id="wallet-address"
                type="text"
                required
                value={address}
                onChange={(event) => onAddressChange(event.target.value)}
                placeholder="Enter a Solana wallet address"
                autoComplete="off"
                spellCheck={false}
                disabled={loading}
                aria-describedby="wallet-address-help"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50/80 pl-10 pr-4 font-mono text-sm text-slate-900 outline-none transition-all placeholder:font-sans placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            <p
              id="wallet-address-help"
              className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"
            >
              <Icon name="lock" size={13} />
              Public addresses only. Never enter a private key or seed phrase.
            </p>

            {validationError && (
              <Alert tone="rose" className="mt-3">
                {validationError}
              </Alert>
            )}
          </div>

          <fieldset className="min-w-0 border-0 p-0">
            <legend className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              Investigation depth
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Optional
              </span>
            </legend>
            <div
              className="mt-2 grid grid-cols-2 gap-2"
              role="radiogroup"
              aria-label="Investigation depth"
            >
              {depthOptions.map((option) => {
                const selected = depth === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={loading}
                    onClick={() => onDepthChange(option.value)}
                    className={cn(
                      "rounded-2xl border px-3 py-2.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60",
                      selected
                        ? "border-indigo-300 bg-indigo-50/80 ring-2 ring-indigo-500/10"
                        : "border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-white"
                    )}
                  >
                    <span
                      className={cn(
                        "block text-xs font-semibold",
                        selected ? "text-indigo-700" : "text-slate-800"
                      )}
                    >
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Icon name="cpu" size={14} />
            Powered by MCP-selected graph tools and deterministic action rules.
          </p>
          <button
            type="submit"
            disabled={loading || !address.trim()}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {loading ? (
              <>
                <Spinner />
                Investigating…
              </>
            ) : (
              <>
                Start investigation
                <Icon name="arrow-right" size={16} />
              </>
            )}
          </button>
        </div>

        {error && !validationError && (
          <Alert
            tone="rose"
            title={
              errorStage === "ingestion"
                ? "Wallet ingestion failed"
                : "Risk report generation failed"
            }
          >
            <p>{error}</p>
            <button
              type="button"
              onClick={onRetry}
              disabled={loading || !address.trim()}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 underline decoration-rose-300 underline-offset-2 hover:decoration-rose-600 disabled:opacity-50"
            >
              <Icon name="refresh" size={13} />
              Retry investigation
            </button>
          </Alert>
        )}
      </form>
    </Card>
  );
}
